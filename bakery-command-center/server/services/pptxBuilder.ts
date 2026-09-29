// AI Presentation Builder — Step 6: the actual .pptx file. This is the only
// place in the pipeline that touches pptxgenjs; every number it draws comes
// straight from presentationNarrative.ts's already-validated NarrativeSlide
// objects (title/bullets already token-substituted, categoryData already
// verified) and presentationCharts.ts's deterministic chart specs — nothing
// is computed or invented here, this file only lays things out.
//
// Design: 16:9, one of presentationTheme.ts's six curated themes (picked
// once per deck — see buildPresentationPptx's `theme` param — so decks vary
// but stay internally consistent), alternating full-bleed DARK slides
// (title, recommendations, sources) with full-bleed LIGHT data slides
// (charts/tables always want a light surface to stay legible) — see
// modeForLayout() below. Restrained semantic red/green/amber accents still
// come from presentationCharts.ts's fixed DECK_COLORS regardless of theme
// (see that file's header for why those never rotate). Body/chart/table font
// is Calibri, same rationale as before — a standard cross-platform sans that
// won't silently substitute on the recipient's machine. The title slide's
// headline uses Georgia, a standard cross-platform SERIF (same
// installed-everywhere guarantee as Calibri), for the editorial cover-page
// look the person asked for — confined to that one slide's headline/subhead,
// so the rest of the deck stays as readable as before.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import type { NarrativeResult, NarrativeSlide } from './presentationNarrative.ts';
import { isUploadCategoryId } from './presentationPlanner.ts';
import type { PresentationPlan, SlideLayout } from './presentationPlanner.ts';
import { buildChartSpec, DECK_COLORS, type ChartSpec } from './presentationCharts.ts';
import type { DeckTheme } from './presentationTheme.ts';
import type { AttentionItem } from '../../src/lib/commandCenterSignals.ts';
import type { RiskSnapshot } from './presentationData.ts';
import type { UploadSheetMetrics } from './presentationUploadData.ts';

const SLIDE_W_IN = 13.333;
const SLIDE_H_IN = 7.5;
const MARGIN_IN = 0.5;
const FONT_FACE = 'Calibri';
const SERIF_FONT_FACE = 'Georgia';

// ---------------------------------------------------------------------------
// Logo assets (server/assets/) — pre-processed into transparent-background
// PNGs in two ink colors (dark ink for a light slide, cream ink for a dark
// slide) so the same mark reads correctly against whichever background this
// slide is in, and in two crops: the full "logo" lockup (mark + wordmark,
// for the title slide) and just the "mark" (the G monogram alone, for the
// small watermark on every other slide — a wide wordmark shrunk to
// watermark size stops being legible, the mark alone doesn't).
// ---------------------------------------------------------------------------
const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
// Real aspect ratios of the processed crops (server/assets/*.png) — used so
// a requested width always keeps the logo undistorted without pptxgenjs
// needing to probe the file itself.
const LOGO_ASPECT = 554 / 171; // wordmark lockup, wide
const MARK_ASPECT = 174 / 171; // monogram alone, near-square

type SlideMode = 'dark' | 'light';

function modeForLayout(layout: SlideLayout): SlideMode {
  return layout === 'title_exec_summary' || layout === 'recommendations' || layout === 'sources_methodology' ? 'dark' : 'light';
}

function inkFor(theme: DeckTheme, mode: SlideMode): string {
  return mode === 'dark' ? theme.groundInk : theme.lightInk;
}
function groundFor(theme: DeckTheme, mode: SlideMode): string {
  return mode === 'dark' ? theme.ground : theme.light;
}

// ---------------------------------------------------------------------------
// Shared chrome — header/footer/watermark, consistent on every slide.
// ---------------------------------------------------------------------------
function addWatermark(slide: PptxGenJS.Slide, mode: SlideMode): void {
  const ink = mode === 'dark' ? 'light' : 'dark';
  const w = 0.34;
  const h = w / MARK_ASPECT;
  slide.addImage({ path: path.join(ASSETS_DIR, `grandiose-mark-${ink}.png`), x: SLIDE_W_IN - MARGIN_IN - w, y: 0.28, w, h, transparency: 15 });
}

function addHeader(slide: PptxGenJS.Slide, title: string, theme: DeckTheme, mode: SlideMode): void {
  slide.addText(title, {
    x: MARGIN_IN,
    y: 0.35,
    w: SLIDE_W_IN - MARGIN_IN * 2 - 0.6, // leaves room for the watermark at top-right
    h: 0.9,
    fontFace: FONT_FACE,
    fontSize: 24,
    bold: true,
    color: inkFor(theme, mode),
    align: 'left',
    valign: 'top',
  });
  slide.addShape('line', {
    x: MARGIN_IN,
    y: 1.25,
    w: SLIDE_W_IN - MARGIN_IN * 2,
    h: 0,
    line: { color: mode === 'dark' ? theme.groundInk : DECK_COLORS.borderSubtle, width: 1, transparency: mode === 'dark' ? 75 : 0 },
  });
}

function addFooter(slide: PptxGenJS.Slide, pageNum: number, totalPages: number, isDemoData: boolean, theme: DeckTheme, mode: SlideMode): void {
  // Muted via transparency on the mode's own ink color, rather than a
  // separate hex per theme+mode — keeps the theme type to just the four
  // colors it actually needs (ground/groundInk/light/lightInk/accent).
  slide.addText(`Grandiose Bakery Command Center · ${pageNum} / ${totalPages}`, {
    x: MARGIN_IN,
    y: SLIDE_H_IN - 0.4,
    w: 7,
    h: 0.3,
    fontFace: FONT_FACE,
    fontSize: 9,
    color: inkFor(theme, mode),
    transparency: 40,
    align: 'left',
  });
  if (isDemoData) {
    slide.addText('ILLUSTRATIVE / DEMO DATA', {
      x: SLIDE_W_IN - MARGIN_IN - 3.5,
      y: SLIDE_H_IN - 0.4,
      w: 3.5,
      h: 0.3,
      fontFace: FONT_FACE,
      fontSize: 9,
      bold: true,
      color: DECK_COLORS.accentAmber,
      align: 'right',
    });
  }
}

function addBulletList(slide: PptxGenJS.Slide, bullets: string[], opts: { x: number; y: number; w: number; h: number; fontSize?: number; color?: string }): void {
  if (bullets.length === 0) return;
  slide.addText(
    bullets.map((b) => ({ text: b, options: { bullet: { indent: 14 }, breakLine: true, paraSpaceAfter: 8 } })),
    {
      x: opts.x,
      y: opts.y,
      w: opts.w,
      h: opts.h,
      fontFace: FONT_FACE,
      fontSize: opts.fontSize ?? 14,
      color: opts.color ?? DECK_COLORS.textPrimary,
      valign: 'top',
    },
  );
}

// ---------------------------------------------------------------------------
// Chart rendering — turns a ChartSpec (Step 5) into a native, editable
// pptxgenjs chart object (never a rasterized image), so the recipient can
// still click into the chart in PowerPoint.
// ---------------------------------------------------------------------------
function valAxisFormatCode(format: ChartSpec['valueFormat']): string {
  if (format === '%') return '0.0"%"';
  if (format === 'AED') return '"AED "#,##0';
  return '#,##0';
}

/**
 * pptxgenjs's `chartColors` is one flat array consumed differently depending
 * on series count: for a single series it's a per-CATEGORY color cycle (so a
 * ChartSpec series with an array `color` — e.g. wastage bars colored red/
 * green per division — maps straight onto it); for multiple series it's one
 * color per SERIES (so grouped_bar's two plain-string series colors map onto
 * it in order). A series color that's unexpectedly an array in the
 * multi-series case falls back to accent blue rather than erroring — should
 * never happen given how presentationCharts.ts actually builds specs, but
 * this keeps a future category addition from breaking chart rendering.
 */
function resolveChartColors(spec: ChartSpec, accent: string): string[] {
  if (spec.series.length === 1) {
    const color = spec.series[0].color;
    return Array.isArray(color) ? color : [color];
  }
  return spec.series.map((s) => (Array.isArray(s.color) ? accent : s.color));
}

function addChartFromSpec(slide: PptxGenJS.Slide, spec: ChartSpec, accent: string, opts: { x: number; y: number; w: number; h: number }): void {
  if (spec.kind === 'none' || spec.categories.length === 0) return;

  // Plain string literals rather than the PptxGenJS.ChartType enum — that
  // enum lives on a *class instance* (`pptx.ChartType`), not as a static
  // property of the imported class, and CHART_NAME's type is a string union
  // anyway, so the literal is both simpler and avoids threading the pptx
  // instance through this whole call chain just to read a constant.
  const chartType: PptxGenJS.CHART_NAME = spec.kind === 'line' ? 'line' : 'bar';
  const chartData = spec.series.map((s) => ({ name: s.name, labels: spec.categories, values: s.values }));

  slide.addChart(chartType, chartData, {
    x: opts.x,
    y: opts.y,
    w: opts.w,
    h: opts.h,
    barDir: 'col',
    barGrouping: spec.kind === 'grouped_bar' ? 'clustered' : 'standard',
    chartColors: resolveChartColors(spec, accent),
    showLegend: spec.series.length > 1,
    legendPos: 'b',
    showTitle: false,
    showValue: spec.categories.length <= 8,
    dataLabelFormatCode: valAxisFormatCode(spec.valueFormat),
    valAxisLabelFormatCode: valAxisFormatCode(spec.valueFormat),
    catAxisLabelFontSize: 10,
    valAxisLabelFontSize: 10,
    catAxisLabelColor: DECK_COLORS.textSecondary,
    valAxisLabelColor: DECK_COLORS.textSecondary,
    dataLabelColor: DECK_COLORS.textPrimary,
    dataLabelFontSize: 9,
    chartArea: { fill: { color: DECK_COLORS.bgPanel } },
    plotArea: { fill: { color: DECK_COLORS.bgPanel } },
    catGridLine: { style: 'none' },
    valGridLine: { color: DECK_COLORS.borderSubtle, style: 'solid', size: 0.5 },
    dataLabelPosition: spec.kind === 'line' ? 't' : 'outEnd',
  } as PptxGenJS.IChartOpts);

  if (spec.referenceLine) {
    // pptxgenjs has no first-class "reference line" primitive on a bar/line
    // chart — a thin shape overlaid at the right height is the standard
    // workaround (same technique the spec's own waterfall suggestion relies
    // on: a transparent/plain shape standing in for a chart feature the
    // library doesn't expose directly). Approximate placement only — exact
    // to within the chart's own inner plot margin, which pptxgenjs doesn't
    // expose precisely, so this is a deliberate visual approximation, not a
    // precise data marker.
    const approxPlotTop = opts.y + 0.3;
    const approxPlotHeight = opts.h - 0.9;
    slide.addText(spec.referenceLine.label, {
      x: opts.x + opts.w - 2.2,
      y: approxPlotTop,
      w: 2.1,
      h: 0.25,
      fontFace: FONT_FACE,
      fontSize: 8,
      italic: true,
      color: DECK_COLORS.textTertiary,
      align: 'right',
    });
    void approxPlotHeight; // reserved for a future, more precise placement — see comment above
  }
}

// ---------------------------------------------------------------------------
// Table rendering for non-chart categories (command_center_attention,
// ai_risk_research) — plain, readable tables rather than forcing qualitative
// content into a chart it doesn't fit.
// ---------------------------------------------------------------------------
function headerCell(text: string): PptxGenJS.TableCell {
  return { text, options: { bold: true, color: DECK_COLORS.textPrimary, fill: { color: DECK_COLORS.bgPanelRaised }, fontFace: FONT_FACE, fontSize: 11 } };
}
function bodyCell(text: string): PptxGenJS.TableCell {
  return { text, options: { color: DECK_COLORS.textPrimary, fontFace: FONT_FACE, fontSize: 10, valign: 'top' } };
}

function buildAttentionItemsTable(items: AttentionItem[]): PptxGenJS.TableRow[] {
  const rows: PptxGenJS.TableRow[] = [[headerCell('Signal'), headerCell('Finding'), headerCell('Why it matters')]];
  for (const item of items) rows.push([bodyCell(item.signal), bodyCell(item.title), bodyCell(item.reason)]);
  return rows;
}

/** Mirrors ExecutiveBrief.tsx's formatSupplierPrice — deliberately re-implemented here (not imported) since that file is a .tsx React component and this is a server-side .pptx builder; keeping the same price-classification logic in two small, independent places is safer than importing UI code into the server bundle. Any change to supplier price formatting must be made in both places. */
function formatSupplierPriceForDeck(s: {
  priceLevel: string;
  priceAmount: number | null;
  priceAmountHigh: number | null;
  priceCurrency: string | null;
  priceUnit: string | null;
}): string {
  if (s.priceLevel === 'request_quote' || s.priceAmount === null) return 'Request quote';
  const cur = s.priceCurrency ?? '';
  const unit = s.priceUnit ? ` / ${s.priceUnit}` : '';
  if (s.priceAmountHigh !== null && s.priceAmountHigh !== s.priceAmount) return `${cur} ${s.priceAmount}–${s.priceAmountHigh}${unit}`;
  return `${cur} ${s.priceAmount}${unit}`;
}

function buildRiskSnapshotTable(snapshot: RiskSnapshot): PptxGenJS.TableRow[] | null {
  const suppliers = snapshot.supplierResearch[0]?.result.suppliers ?? [];
  if (suppliers.length === 0) return null;
  const rows: PptxGenJS.TableRow[] = [[headerCell('Supplier'), headerCell('Price'), headerCell('Evidence')]];
  for (const s of suppliers) {
    rows.push([bodyCell(s.name + (s.isRetailBenchmark ? ' [Retail Benchmark]' : '')), bodyCell(formatSupplierPriceForDeck(s)), bodyCell(s.evidenceQuality)]);
  }
  return rows;
}

const TABLE_ROW_H_IN = 0.45; // natural row height — without this, pptxgenjs stretches rows to fill whatever `h` is passed, which reads as excessive whitespace for a short table (spec's "professional spacing", not empty padding)

/** Returns the height actually used, so callers can lay out what follows it without guessing. */
function addTable(slide: PptxGenJS.Slide, rows: PptxGenJS.TableRow[], opts: { x: number; y: number; w: number; maxH: number }): number {
  const naturalH = Math.min(rows.length * TABLE_ROW_H_IN, opts.maxH);
  slide.addTable(rows, {
    x: opts.x,
    y: opts.y,
    w: opts.w,
    h: naturalH,
    border: { type: 'solid', color: DECK_COLORS.borderSubtle, pt: 0.5 },
    autoPage: false,
  });
  return naturalH;
}

// ---------------------------------------------------------------------------
// Per-layout slide rendering.
// ---------------------------------------------------------------------------
function contentAreaTop(): number {
  return 1.5;
}

function renderTitleSlide(slide: PptxGenJS.Slide, narrated: NarrativeSlide, plan: PresentationPlan, theme: DeckTheme): void {
  const ink = theme.groundInk;
  const logoW = 2.3;
  const logoH = logoW / LOGO_ASPECT;
  slide.addImage({ path: path.join(ASSETS_DIR, 'grandiose-logo-light.png'), x: MARGIN_IN, y: 0.55, w: logoW, h: logoH });

  slide.addText(narrated.title, {
    x: MARGIN_IN,
    y: 2.6,
    w: SLIDE_W_IN - MARGIN_IN * 2,
    h: 1.5,
    fontFace: SERIF_FONT_FACE,
    fontSize: 36,
    bold: true,
    color: ink,
    align: 'left',
    valign: 'bottom',
  });
  const subtitleParts = [plan.audience ? `Prepared for: ${plan.audience}` : null, `Style: ${plan.style.replace(/_/g, ' ')}`].filter(Boolean);
  slide.addText(subtitleParts.join('   ·   '), {
    x: MARGIN_IN,
    y: 4.15,
    w: SLIDE_W_IN - MARGIN_IN * 2,
    h: 0.4,
    fontFace: SERIF_FONT_FACE,
    italic: true,
    fontSize: 15,
    color: ink,
    transparency: 25,
  });
  slide.addShape('line', {
    x: MARGIN_IN,
    y: 4.75,
    w: 1.6,
    h: 0,
    line: { color: theme.accent, width: 2 },
  });
  addBulletList(slide, narrated.bullets, { x: MARGIN_IN, y: 5.05, w: SLIDE_W_IN - MARGIN_IN * 2, h: 1.7, fontSize: 15, color: ink });
}

function renderDataSlide(slide: PptxGenJS.Slide, narrated: NarrativeSlide, twoUp: boolean, theme: DeckTheme): void {
  addHeader(slide, narrated.title, theme, 'light');
  const top = contentAreaTop();
  const bottomMargin = 0.6;
  const contentH = SLIDE_H_IN - top - bottomMargin;

  if (!narrated.dataAvailable) {
    addBulletList(slide, narrated.bullets, { x: MARGIN_IN, y: top, w: SLIDE_W_IN - MARGIN_IN * 2, h: contentH, fontSize: 16 });
    return;
  }

  const specs = narrated.categoryData.map((c) => buildChartSpec(c.id, c.data, theme.accent));
  const hasChart = specs.some((s) => s.kind !== 'none');

  if (!hasChart) {
    // No chart-shaped category on this slide — render its content as a table (command_center_attention / ai_risk_research) plus the narrative bullets.
    const tableRows = buildTableForNonChartSlide(narrated);
    const tableH = tableRows ? addTable(slide, tableRows, { x: MARGIN_IN, y: top, w: SLIDE_W_IN - MARGIN_IN * 2, maxH: contentH * 0.62 }) : 0;
    addBulletList(slide, narrated.bullets, {
      x: MARGIN_IN,
      y: top + tableH + 0.2,
      w: SLIDE_W_IN - MARGIN_IN * 2,
      h: contentH - tableH - 0.2,
      fontSize: 13,
    });
    return;
  }

  if (twoUp && specs.length >= 2) {
    const chartW = (SLIDE_W_IN - MARGIN_IN * 2 - 0.3) / 2;
    addChartFromSpec(slide, specs[0], theme.accent, { x: MARGIN_IN, y: top, w: chartW, h: contentH * 0.72 });
    addChartFromSpec(slide, specs[1], theme.accent, { x: MARGIN_IN + chartW + 0.3, y: top, w: chartW, h: contentH * 0.72 });
    addBulletList(slide, narrated.bullets, { x: MARGIN_IN, y: top + contentH * 0.72 + 0.15, w: SLIDE_W_IN - MARGIN_IN * 2, h: contentH * 0.28 - 0.15, fontSize: 12 });
    return;
  }

  // Single chart + interpretation, side by side (kpi_chart_interpretation / large_chart_finding default).
  const chartW = SLIDE_W_IN - MARGIN_IN * 2 - 3.6;
  addChartFromSpec(slide, specs[0], theme.accent, { x: MARGIN_IN, y: top, w: chartW, h: contentH });
  addBulletList(slide, narrated.bullets, { x: MARGIN_IN + chartW + 0.3, y: top, w: 3.3, h: contentH, fontSize: 13 });
}

/** Step 9's fallback for an uploaded sheet with no numeric columns (or as a companion to the average-value chart when a sheet has both) — shows each categorical column's spread rather than nothing. */
function buildUploadCategoricalTable(data: UploadSheetMetrics): PptxGenJS.TableRow[] | null {
  if (data.categoricalColumns.length === 0) return null;
  const rows: PptxGenJS.TableRow[] = [[headerCell('Column'), headerCell('Distinct values'), headerCell('Most common')]];
  for (const c of data.categoricalColumns) {
    const topValues = c.topValues.map((v) => `${v.value} (${v.count})`).join(', ');
    rows.push([bodyCell(c.column), bodyCell(String(c.distinctCount)), bodyCell(topValues || '—')]);
  }
  return rows;
}

function buildTableForNonChartSlide(narrated: NarrativeSlide): PptxGenJS.TableRow[] | null {
  const first = narrated.categoryData[0];
  if (!first) return null;
  if (first.id === 'command_center_attention') return buildAttentionItemsTable(first.data as AttentionItem[]);
  if (first.id === 'ai_risk_research') return buildRiskSnapshotTable(first.data as RiskSnapshot);
  if (isUploadCategoryId(first.id)) return buildUploadCategoricalTable(first.data as UploadSheetMetrics);
  return null;
}

/**
 * Recommendation + rationale, two columns — presentationNarrative.ts's
 * structured Claude call (Step 4b) produces these rows directly, rather than
 * this file inferring structure from a flat bullet list. Every cell gets an
 * explicit `fill` matching the slide's own dark ground: pptxgenjs's table
 * defaults to an opaque white cell background when none is given, which
 * would draw a stray white box over this full-bleed dark slide.
 */
function buildRecommendationsTable(rows: { recommendation: string; rationale: string }[], theme: DeckTheme): PptxGenJS.TableRow[] {
  // theme.ground/groundInk are used with their '#' prefix intact everywhere
  // else in this file (addText/addShape color options) and render correctly
  // — pptxgenjs normalizes hex internally — so this stays consistent rather
  // than stripping it only here.
  const fill = { color: theme.ground };
  const headerBorder: PptxGenJS.TableCell['options'] = { border: [{ type: 'none' }, { type: 'none' }, { type: 'solid', color: theme.groundInk, pt: 1 }, { type: 'none' }] };
  const rowBorder: PptxGenJS.TableCell['options'] = { border: [{ type: 'none' }, { type: 'none' }, { type: 'solid', color: theme.groundInk, pt: 0.5 }, { type: 'none' }] };

  const header: PptxGenJS.TableRow = [
    { text: 'Recommendation', options: { bold: true, color: theme.groundInk, fill, fontFace: FONT_FACE, fontSize: 12, valign: 'bottom', ...headerBorder } },
    { text: 'Why it matters', options: { bold: true, color: theme.groundInk, fill, fontFace: FONT_FACE, fontSize: 12, valign: 'bottom', ...headerBorder } },
  ];
  const body: PptxGenJS.TableRow[] = rows.map((r) => [
    { text: r.recommendation, options: { bold: true, color: theme.groundInk, fill, fontFace: FONT_FACE, fontSize: 12, valign: 'top', ...rowBorder } },
    { text: r.rationale, options: { color: theme.groundInk, transparency: 15, fill, fontFace: FONT_FACE, fontSize: 11, valign: 'top', ...rowBorder } },
  ]);
  return [header, ...body];
}

function renderRecommendationsSlide(slide: PptxGenJS.Slide, narrated: NarrativeSlide, theme: DeckTheme): void {
  addHeader(slide, narrated.title, theme, 'dark');
  const top = contentAreaTop();

  if (narrated.recommendationRows && narrated.recommendationRows.length > 0) {
    const contentW = SLIDE_W_IN - MARGIN_IN * 2;
    slide.addTable(buildRecommendationsTable(narrated.recommendationRows, theme), {
      x: MARGIN_IN,
      y: top,
      w: contentW,
      colW: [contentW * 0.55, contentW * 0.45],
      autoPage: false,
      valign: 'top',
    });
    return;
  }

  // Fallback: the structured Claude call failed validation on both attempts
  // (presentationNarrative.ts's narrateRecommendations) — a plain numbered
  // list from whatever generic text came back, same as before this feature.
  slide.addText(
    narrated.bullets.map((b, i) => ({ text: `${i + 1}. ${b}`, options: { breakLine: true, paraSpaceAfter: 12 } })),
    {
      x: MARGIN_IN,
      y: top,
      w: SLIDE_W_IN - MARGIN_IN * 2,
      h: SLIDE_H_IN - top - 0.6,
      fontFace: FONT_FACE,
      fontSize: 15,
      color: theme.groundInk,
      valign: 'top',
    },
  );
}

function renderSourcesSlide(slide: PptxGenJS.Slide, narrated: NarrativeSlide, theme: DeckTheme): void {
  addHeader(slide, narrated.title, theme, 'dark');
  addBulletList(slide, narrated.bullets, { x: MARGIN_IN, y: contentAreaTop(), w: SLIDE_W_IN - MARGIN_IN * 2, h: SLIDE_H_IN - contentAreaTop() - 0.6, fontSize: 13, color: theme.groundInk });
}

function renderSlide(slide: PptxGenJS.Slide, narrated: NarrativeSlide, plan: PresentationPlan, theme: DeckTheme): void {
  switch (narrated.layout) {
    case 'title_exec_summary':
      renderTitleSlide(slide, narrated, plan, theme);
      return;
    case 'recommendations':
      renderRecommendationsSlide(slide, narrated, theme);
      return;
    case 'sources_methodology':
      renderSourcesSlide(slide, narrated, theme);
      return;
    case 'two_chart_comparison':
    case 'scenario_optimization_comparison':
      renderDataSlide(slide, narrated, true, theme);
      return;
    case 'kpi_chart_interpretation':
    case 'large_chart_finding':
    case 'table_insight':
      renderDataSlide(slide, narrated, false, theme);
      return;
  }
}

// ---------------------------------------------------------------------------
// Pre-download quality checks (spec §: slide count matches, no blank
// slides, no text overflow markers, no "undefined"/"NaN"/raw JSON, demo-data
// disclosure present where required). Non-blocking — returned as warnings so
// the route layer (Step 7) can decide whether to surface them, rather than
// silently failing a deck that is otherwise usable.
// ---------------------------------------------------------------------------
const SUSPICIOUS_TEXT_PATTERN = /\bundefined\b|\bNaN\b|\[object Object\]|^\s*\{.*\}\s*$/;

function runQualityChecks(plan: PresentationPlan, narrative: NarrativeResult): string[] {
  const warnings: string[] = [];
  if (narrative.slides.length !== plan.slides.length) {
    warnings.push(`Expected ${plan.slides.length} slides but generated ${narrative.slides.length}.`);
  }
  const seenTitles: string[] = [];
  for (const slide of narrative.slides) {
    if (!slide.title.trim()) warnings.push(`Slide ${slide.order} has a blank title.`);
    if (slide.bullets.length === 0) warnings.push(`Slide ${slide.order} ("${slide.title}") has no body content.`);
    for (const b of [slide.title, ...slide.bullets]) {
      if (SUSPICIOUS_TEXT_PATTERN.test(b)) warnings.push(`Slide ${slide.order} contains suspicious text: "${b.slice(0, 80)}".`);
    }
    if (seenTitles.length > 0 && seenTitles[seenTitles.length - 1] === slide.title) {
      warnings.push(`Slide ${slide.order} repeats the previous slide's title ("${slide.title}").`);
    }
    seenTitles.push(slide.title);
  }
  const anyDemoData = narrative.slides.some((s) => s.isDemoData);
  const sourcesSlide = narrative.slides.find((s) => s.layout === 'sources_methodology');
  if (anyDemoData && sourcesSlide && !sourcesSlide.bullets.some((b) => b.includes('ILLUSTRATIVE / DEMO DATA'))) {
    warnings.push('Demo data was used but the disclosure line is missing from the sources slide.');
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------
export interface BuildPptxRequest {
  plan: PresentationPlan;
  narrative: NarrativeResult;
  /** Picked once per deck (see presentationBuilder.ts's pickRandomTheme() call) so a single generation stays internally consistent — see this file's header. */
  theme: DeckTheme;
}

export interface BuildPptxResult {
  buffer: Buffer;
  warnings: string[];
}

export async function buildPresentationPptx(request: BuildPptxRequest): Promise<BuildPptxResult> {
  const { plan, narrative, theme } = request;
  const warnings = runQualityChecks(plan, narrative);

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'GRANDIOSE_WIDE', width: SLIDE_W_IN, height: SLIDE_H_IN });
  pptx.layout = 'GRANDIOSE_WIDE';
  pptx.author = 'Grandiose Bakery Command Center';
  pptx.title = plan.objective;

  const totalSlides = narrative.slides.length;
  for (const narrated of narrative.slides) {
    const mode = modeForLayout(narrated.layout);
    const slide = pptx.addSlide();
    slide.background = { color: groundFor(theme, mode) };
    renderSlide(slide, narrated, plan, theme);
    // Logo lockup already appears full-size on the title slide itself
    // (renderTitleSlide) — the small watermark is for every OTHER slide,
    // per the user's explicit request.
    if (narrated.layout !== 'title_exec_summary') {
      addWatermark(slide, mode);
      addFooter(slide, narrated.order, totalSlides, narrated.isDemoData, theme, mode);
    }
  }

  const output = await pptx.write({ outputType: 'nodebuffer' });
  const rawBuffer = Buffer.isBuffer(output) ? output : Buffer.from(output as ArrayBuffer);
  const buffer = await repairPptxgenjsChartCorruption(rawBuffer);
  return { buffer, warnings };
}

// ---------------------------------------------------------------------------
// Post-processing repair for a confirmed pptxgenjs 4.0.1 bug (also present in
// 3.12.0 — not something a version bump fixes): every native chart it emits
// (`slide.addChart(...)`, used throughout this file) writes THREE <c:axId>
// references inside the chart-type element (e.g. <c:barChart>), but only
// ever defines TWO actual axes (<c:catAx> + <c:valAx>). The third axId is
// dangling — it names an axis that doesn't exist anywhere in the part. Per
// the OOXML chart schema, a bar/line chart's axId list has a fixed count of
// exactly 2; a 3rd is a real schema violation. LibreOffice/Google Slides
// silently ignore it, but PowerPoint's stricter parser flags the file as
// needing repair and drops content when recovering it — this is what caused
// a chart slide to come back blank after PowerPoint "fixed" the file. Since
// this fires on every single native chart with zero custom options (verified
// with a minimal repro, and across both the installed and previous major
// pptxgenjs version), waiting on an upstream fix isn't an option — this
// function reaches into the already-written .pptx zip and removes exactly
// the dangling axId reference from every chart part, byte for byte,
// touching nothing else in the file.
async function repairPptxgenjsChartCorruption(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  let touched = false;

  const chartFiles = Object.keys(zip.files).filter((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name));
  for (const name of chartFiles) {
    const xml = await zip.file(name)!.async('string');
    zip.file(name, fixDanglingAxIds(xml));
    touched = true;
  }

  // Separately: pptxgenjs's [Content_Types].xml also declares Override
  // entries (e.g. extra slideMaster*.xml parts) for parts it never actually
  // writes to the zip — present even in a minimal deck with zero custom
  // masters/backgrounds, so it looks like a broadly-tolerated quirk rather
  // than the specific repair trigger above. Still a real package/content
  // mismatch though, and cheap to clean up now that the zip is already
  // open, so it's removed defensively alongside the confirmed chart fix.
  const contentTypesFile = zip.file('[Content_Types].xml');
  if (contentTypesFile) {
    const existingParts = new Set(Object.keys(zip.files).map((n) => `/${n}`));
    const xml = await contentTypesFile.async('string');
    const cleaned = xml.replace(/<Override PartName="([^"]+)"[^>]*\/>/g, (whole, partName: string) => (existingParts.has(partName) ? whole : ''));
    if (cleaned !== xml) {
      zip.file('[Content_Types].xml', cleaned);
      touched = true;
    }
  }

  if (!touched) return buffer;
  return zip.generateAsync({ type: 'nodebuffer' });
}

/**
 * Removes any <c:axId val="…"/> reference in a chart part's axId
 * DECLARATION list (the run of axId elements inside the chart-type element,
 * before any <c:catAx>/<c:valAx>/<c:dateAx>/<c:serAx> definition begins)
 * whose value doesn't match a real axis defined later in the same file.
 * Deliberately narrow: it never touches the axId *inside* an axis
 * definition itself (that's the axis's own identity, always valid), only
 * the reference list that names which axes the chart uses.
 */
function fixDanglingAxIds(xml: string): string {
  const firstAxisDefIdx = xml.search(/<c:(catAx|valAx|dateAx|serAx)>/);
  if (firstAxisDefIdx === -1) return xml; // a chart type with no axes (e.g. pie) — nothing to fix
  const head = xml.slice(0, firstAxisDefIdx);
  const tail = xml.slice(firstAxisDefIdx);

  const validAxisIds = new Set<string>();
  const axisDefPattern = /<c:(?:catAx|valAx|dateAx|serAx)>\s*<c:axId val="(\d+)"/g;
  let match: RegExpExecArray | null;
  while ((match = axisDefPattern.exec(tail))) validAxisIds.add(match[1]);

  const fixedHead = head.replace(/<c:axId val="(\d+)"\/>/g, (whole, id: string) => (validAxisIds.has(id) ? whole : ''));
  return fixedHead + tail;
}
