// Client-side chart-to-PNG export. Pure browser Canvas/SVG APIs — no new
// dependency. Every existing chart (recharts and the 3 hand-rolled gauge/
// Sankey SVGs) colors itself with literal `fill="var(--accent-blue)"`-style
// values that only resolve because the live <svg> is attached inside the
// page, inheriting tokens.css's :root custom properties. A cloned/detached
// SVG has no such inheritance, so before rasterizing we walk the *live* SVG
// and copy each element's getComputedStyle-resolved fill/stroke/color onto
// the matching node in a clone — the clone then carries concrete colors and
// renders correctly once serialized on its own.

export interface ChartExportLegendItem {
  label: string;
  color: string;
}

export interface ChartExportOptions {
  /** Shown in the exported image's header band and used to build the filename. */
  title: string;
  /** Active filter/context description (e.g. a search query, selected period, or which
   * research result is displayed) — omit when nothing genuinely narrows this chart. */
  filterContext?: string;
  /** For charts whose color key is separate HTML, not part of the <svg> itself
   * (e.g. a donut's legend rows) — redrawn as a text band under the chart. */
  legend?: ChartExportLegendItem[];
  /** Data-provenance label matching the page's own DataSourceBadge text, if applicable. */
  sourceLabel?: string;
  /** Upscale factor for high-res output. Default 2. */
  scale?: number;
}

const STYLE_PROPS = ['fill', 'stroke', 'stop-color', 'color'] as const;

function hasInlineStyle(el: Element): el is Element & ElementCSSInlineStyle {
  return 'style' in el;
}

/** Recursively copies computed (var()-resolved) color/font values from the live
 * tree onto the matching node in the clone, so the clone has no var() left in it. */
function inlineComputedStyles(liveEl: Element, cloneEl: Element): void {
  if (hasInlineStyle(cloneEl)) {
    const computed = window.getComputedStyle(liveEl);
    for (const prop of STYLE_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (value) cloneEl.style.setProperty(prop, value);
    }
    const fontFamily = computed.getPropertyValue('font-family');
    const fontSize = computed.getPropertyValue('font-size');
    const fontWeight = computed.getPropertyValue('font-weight');
    if (fontFamily) cloneEl.style.setProperty('font-family', fontFamily);
    if (fontSize) cloneEl.style.setProperty('font-size', fontSize);
    if (fontWeight) cloneEl.style.setProperty('font-weight', fontWeight);
  }

  const liveChildren = liveEl.children;
  const cloneChildren = cloneEl.children;
  for (let i = 0; i < liveChildren.length; i++) {
    const cloneChild = cloneChildren[i];
    if (cloneChild) inlineComputedStyles(liveChildren[i], cloneChild);
  }
}

/** width/height attrs (recharts) -> viewBox (hand-rolled gauges/Sankey) -> live bounding rect. */
function resolveSvgPixelSize(svg: SVGSVGElement): { width: number; height: number } {
  const attrWidth = Number(svg.getAttribute('width'));
  const attrHeight = Number(svg.getAttribute('height'));
  let width = Number.isFinite(attrWidth) && attrWidth > 0 ? attrWidth : 0;
  let height = Number.isFinite(attrHeight) && attrHeight > 0 ? attrHeight : 0;

  if (!width || !height) {
    const viewBox = svg.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.trim().split(/\s+/).map(Number);
      if (parts.length === 4) {
        width = width || parts[2];
        height = height || parts[3];
      }
    }
  }

  if (!width || !height) {
    const rect = svg.getBoundingClientRect();
    width = width || rect.width;
    height = height || rect.height;
  }

  return { width, height };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to rasterize chart SVG.'));
    img.src = src;
  });
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function timestampForFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function cssVar(name: string, fallback: string): string {
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Canvas's fillStyle setter, unlike SVG presentation attributes, does not
 * resolve CSS custom properties at all — an invalid assignment is silently
 * ignored, leaving whatever color was set before it. Legend swatches are
 * built from the same `var(--accent-x)`-style literals the charts use, so
 * they need the same resolution the SVG clone gets, just via a different
 * path (getComputedStyle lookup instead of per-element computed style). */
function resolveCssColor(value: string): string {
  const match = /^var\((--[a-zA-Z0-9-]+)\)$/.exec(value.trim());
  if (!match) return value;
  return cssVar(match[1], '#888888');
}

/** measureText's width doesn't depend on the canvas's own pixel dimensions —
 * only on the font currently set on its context — so one throwaway,
 * never-drawn-on canvas can measure every string before the real canvas's
 * final size is even known. */
function textWidth(ctx: CanvasRenderingContext2D, text: string, font: string): number {
  ctx.font = font;
  return ctx.measureText(text).width;
}

/** Truncates to the longest prefix (plus "…") that fits maxWidth, never
 * mid-word-by-accident — an ellipsis on a hard character boundary reads
 * better here than a wrap, since every caller is a single-line title,
 * context line, legend label, or footer, not a paragraph. */
function fitText(ctx: CanvasRenderingContext2D, text: string, font: string, maxWidth: number): string {
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '…';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? text.slice(0, lo) + ellipsis : ellipsis;
}

/**
 * Finds the <svg> inside `container`, rasterizes it at high resolution with
 * resolved (non-var()) colors, composites it onto a canvas with a title/
 * filter-context header, an optional legend band, and a timestamp footer,
 * then downloads the result as a PNG.
 */
export async function exportChartToPng(container: HTMLElement, options: ChartExportOptions): Promise<void> {
  // Excludes the export button's own icon <svg> explicitly, rather than
  // relying on DOM order/nesting — a container that wraps both a chart's
  // title-row button and the chart itself (a completely natural layout)
  // would otherwise let querySelector('svg') match the icon first.
  // TS's querySelector overloads only map simple tag-name selectors (e.g.
  // 'svg') to SVGSVGElement; a compound selector falls back to Element, so
  // the cast below is just recovering type info the selector already
  // guarantees at runtime (":not()" only narrows which svg, not the tag).
  const liveSvg = container.querySelector('svg:not([data-chart-export-icon])') as SVGSVGElement | null;
  if (!liveSvg) throw new Error('No chart found to export.');

  const scale = options.scale ?? 2;
  const { width, height } = resolveSvgPixelSize(liveSvg);
  if (!width || !height) throw new Error('Could not determine chart dimensions.');

  const clone = liveSvg.cloneNode(true) as SVGSVGElement;
  inlineComputedStyles(liveSvg, clone);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const svgString = new XMLSerializer().serializeToString(clone);
  const svgUrl = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }));
  let chartImage: HTMLImageElement;
  try {
    chartImage = await loadImage(svgUrl);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }

  const legendRows = options.legend ?? [];
  const PADDING = 16;
  const HEADER_H = options.filterContext ? 56 : 40;
  const FOOTER_H = 30;
  const LEGEND_ROW_H = 20;
  const LEGEND_DOT_R = 4 * scale;
  const legendH = legendRows.length > 0 ? 10 + legendRows.length * LEGEND_ROW_H : 0;

  const titleFont = `600 ${14 * scale}px Inter, sans-serif`;
  const contextFont = `${11 * scale}px Inter, sans-serif`;
  const legendFont = `${11 * scale}px Inter, sans-serif`;
  const footerFont = `${10 * scale}px Inter, sans-serif`;
  const footerText = options.sourceLabel
    ? `Exported ${new Date().toLocaleString()} — ${options.sourceLabel}`
    : `Exported ${new Date().toLocaleString()}`;

  const chartPixelWidth = Math.round(width * scale);
  const chartPixelHeight = Math.round(height * scale);

  // Canvas width was previously just the chart's own width — fine for the
  // chart itself, but the header/filter-context line, legend labels, and
  // footer ("Exported <timestamp> — <source>") are drawn on top of it and
  // can easily be longer than a small chart (a compact gauge, say) is wide.
  // Measure every string that will be drawn, widen to fit the longest one,
  // but cap how far a small chart gets stretched just for text — anything
  // still too long at that cap is truncated with an ellipsis (fitText
  // below), never a mid-word cutoff.
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  if (!measureCtx) throw new Error('Canvas 2D context unavailable.');

  const legendLabelWidths = legendRows.map((item) => textWidth(measureCtx, item.label, legendFont) + LEGEND_DOT_R * 2 + 6 * scale);
  const longestTextWidth = Math.max(
    textWidth(measureCtx, options.title, titleFont),
    options.filterContext ? textWidth(measureCtx, options.filterContext, contextFont) : 0,
    textWidth(measureCtx, footerText, footerFont),
    ...legendLabelWidths,
    0,
  );

  const MAX_TEXT_DRIVEN_WIDTH = 480 * scale;
  const contentWidth = Math.max(chartPixelWidth, Math.min(longestTextWidth, MAX_TEXT_DRIVEN_WIDTH));
  const canvasWidth = Math.round(contentWidth + PADDING * 2 * scale);
  const canvasHeight = Math.round((HEADER_H + FOOTER_H + legendH) * scale) + chartPixelHeight;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  const bg = cssVar('--bg-panel', '#ffffff');
  const textPrimary = cssVar('--text-primary', '#111111');
  const textTertiary = cssVar('--text-tertiary', '#666666');
  const borderSubtle = cssVar('--border-subtle', '#dddddd');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.textBaseline = 'top';

  // contentWidth is the space between the left and right padding — the
  // backstop bound every drawn line is truncated against, regardless of
  // whether the canvas ended up chart-width-driven or text-width-driven.
  ctx.fillStyle = textPrimary;
  ctx.fillText(fitText(ctx, options.title, titleFont, contentWidth), PADDING * scale, PADDING * scale);

  if (options.filterContext) {
    ctx.fillStyle = textTertiary;
    ctx.fillText(fitText(ctx, options.filterContext, contextFont, contentWidth), PADDING * scale, (PADDING + 20) * scale);
  }

  const chartY = Math.round(HEADER_H * scale);
  ctx.drawImage(chartImage, PADDING * scale, chartY, chartPixelWidth, chartPixelHeight);

  let legendY = chartY + chartPixelHeight + Math.round(10 * scale);
  for (const item of legendRows) {
    ctx.fillStyle = resolveCssColor(item.color);
    ctx.beginPath();
    ctx.arc(PADDING * scale + LEGEND_DOT_R, legendY + LEGEND_DOT_R, LEGEND_DOT_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = textTertiary;
    const labelMaxWidth = contentWidth - (LEGEND_DOT_R * 2 + 6 * scale);
    ctx.fillText(fitText(ctx, item.label, legendFont, labelMaxWidth), PADDING * scale + LEGEND_DOT_R * 2 + 6 * scale, legendY);
    legendY += LEGEND_ROW_H * scale;
  }

  const footerLineY = canvasHeight - Math.round(FOOTER_H * scale);
  ctx.strokeStyle = borderSubtle;
  ctx.lineWidth = Math.max(1, scale);
  ctx.beginPath();
  ctx.moveTo(PADDING * scale, footerLineY);
  ctx.lineTo(canvasWidth - PADDING * scale, footerLineY);
  ctx.stroke();

  ctx.fillStyle = textTertiary;
  ctx.fillText(fitText(ctx, footerText, footerFont, contentWidth), PADDING * scale, footerLineY + 8 * scale);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Failed to generate PNG.');

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(options.title)}_${timestampForFilename()}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
