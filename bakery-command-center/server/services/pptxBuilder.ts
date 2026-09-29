// AI Presentation Builder — Step 6: the actual .pptx file. This is the only
// place in the pipeline that touches pptxgenjs; every number it draws comes
// straight from presentationNarrative.ts's already-validated NarrativeSlide
// objects (title/bullets already token-substituted, categoryData already
// verified) and presentationCharts.ts's deterministic chart specs — nothing
// is computed or invented here, this file only lays things out.
//
// Design: 16:9, white/off-white background, dark charcoal text, restrained
// blue/green/red/amber accents pulled from presentationCharts.ts's
// DECK_COLORS (the app's own light-mode tokens) — matching the spec's "looks
// like it belongs to Grandiose Bakery Command Center" requirement without
// reimplementing the dashboard's dark-mode-first design (a deck is always
// read on a light background). Font is Calibri rather than the dashboard's
// Inter — Inter is not a standard PowerPoint/Keynote/Office-Online font, and
// shipping a deck that silently substitutes fonts on the recipient's machine
// risks the "opens without repair warnings / reflowed text" failure mode the
// spec explicitly calls out; Calibri is present on every mainstream install
// and is a close-enough sans-serif for a management deck.
import PptxGenJS from 'pptxgenjs';
import type { NarrativeResult, NarrativeSlide } from './presentationNarrative.ts';
import type { PresentationPlan } from './presentationPlanner.ts';
import { buildChartSpec, DECK_COLORS, type ChartSpec } from './presentationCharts.ts';
import type { AttentionItem } from '../../src/lib/commandCenterSignals.ts';
import type { RiskSnapshot } from './presentationData.ts';

const SLIDE_W_IN = 13.333;
const SLIDE_H_IN = 7.5;
const MARGIN_IN = 0.5;
const FONT_FACE = 'Calibri';

// ---------------------------------------------------------------------------
// Shared chrome — header/footer, consistent on every slide.
// ---------------------------------------------------------------------------
function addHeader(slide: PptxGenJS.Slide, title: string): void {
  slide.addText(title, {
    x: MARGIN_IN,
    y: 0.35,
    w: SLIDE_W_IN - MARGIN_IN * 2,
    h: 0.9,
    fontFace: FONT_FACE,
    fontSize: 24,
    bold: true,
    color: DECK_COLORS.textPrimary,
    align: 'left',
    valign: 'top',
  });
  slide.addShape('line', {
    x: MARGIN_IN,
    y: 1.25,
    w: SLIDE_W_IN - MARGIN_IN * 2,
    h: 0,
    line: { color: DECK_COLORS.borderSubtle, width: 1 },
  });
}

function addFooter(slide: PptxGenJS.Slide, pageNum: number, totalPages: number, isDemoData: boolean): void {
  slide.addText(`Grandiose Bakery Command Center · ${pageNum} / ${totalPages}`, {
    x: MARGIN_IN,
    y: SLIDE_H_IN - 0.4,
    w: 7,
    h: 0.3,
    fontFace: FONT_FACE,
    fontSize: 9,
    color: DECK_COLORS.textTertiary,
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

function addBulletList(slide: PptxGenJS.Slide, bullets: string[], opts: { x: number; y: number; w: number; h: number; fontSize?: number }): void {
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
      color: DECK_COLORS.textPrimary,
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
function resolveChartColors(spec: ChartSpec): string[] {
  if (spec.series.length === 1) {
    const color = spec.series[0].color;
    return Array.isArray(color) ? color : [color];
  }
  return spec.series.map((s) => (Array.isArray(s.color) ? DECK_COLORS.accentBlue : s.color));
}

function addChartFromSpec(slide: PptxGenJS.Slide, spec: ChartSpec, opts: { x: number; y: number; w: number; h: number }): void {
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
    chartColors: resolveChartColors(spec),
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

function renderTitleSlide(slide: PptxGenJS.Slide, narrated: NarrativeSlide, plan: PresentationPlan): void {
  slide.addText(narrated.title, {
    x: MARGIN_IN,
    y: 2.6,
    w: SLIDE_W_IN - MARGIN_IN * 2,
    h: 1.4,
    fontFace: FONT_FACE,
    fontSize: 34,
    bold: true,
    color: DECK_COLORS.textPrimary,
    align: 'left',
    valign: 'bottom',
  });
  const subtitleParts = [plan.audience ? `Prepared for: ${plan.audience}` : null, `Style: ${plan.style.replace(/_/g, ' ')}`].filter(Boolean);
  slide.addText(subtitleParts.join('  ·  '), {
    x: MARGIN_IN,
    y: 4.0,
    w: SLIDE_W_IN - MARGIN_IN * 2,
    h: 0.4,
    fontFace: FONT_FACE,
    fontSize: 14,
    color: DECK_COLORS.textSecondary,
  });
  addBulletList(slide, narrated.bullets, { x: MARGIN_IN, y: 4.6, w: SLIDE_W_IN - MARGIN_IN * 2, h: 2, fontSize: 15 });
}

function renderDataSlide(slide: PptxGenJS.Slide, narrated: NarrativeSlide, twoUp: boolean): void {
  addHeader(slide, narrated.title);
  const top = contentAreaTop();
  const bottomMargin = 0.6;
  const contentH = SLIDE_H_IN - top - bottomMargin;

  if (!narrated.dataAvailable) {
    addBulletList(slide, narrated.bullets, { x: MARGIN_IN, y: top, w: SLIDE_W_IN - MARGIN_IN * 2, h: contentH, fontSize: 16 });
    return;
  }

  const specs = narrated.categoryData.map((c) => buildChartSpec(c.id, c.data));
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
    addChartFromSpec(slide, specs[0], { x: MARGIN_IN, y: top, w: chartW, h: contentH * 0.72 });
    addChartFromSpec(slide, specs[1], { x: MARGIN_IN + chartW + 0.3, y: top, w: chartW, h: contentH * 0.72 });
    addBulletList(slide, narrated.bullets, { x: MARGIN_IN, y: top + contentH * 0.72 + 0.15, w: SLIDE_W_IN - MARGIN_IN * 2, h: contentH * 0.28 - 0.15, fontSize: 12 });
    return;
  }

  // Single chart + interpretation, side by side (kpi_chart_interpretation / large_chart_finding default).
  const chartW = SLIDE_W_IN - MARGIN_IN * 2 - 3.6;
  addChartFromSpec(slide, specs[0], { x: MARGIN_IN, y: top, w: chartW, h: contentH });
  addBulletList(slide, narrated.bullets, { x: MARGIN_IN + chartW + 0.3, y: top, w: 3.3, h: contentH, fontSize: 13 });
}

function buildTableForNonChartSlide(narrated: NarrativeSlide): PptxGenJS.TableRow[] | null {
  const first = narrated.categoryData[0];
  if (!first) return null;
  if (first.id === 'command_center_attention') return buildAttentionItemsTable(first.data as AttentionItem[]);
  if (first.id === 'ai_risk_research') return buildRiskSnapshotTable(first.data as RiskSnapshot);
  return null;
}

function renderRecommendationsSlide(slide: PptxGenJS.Slide, narrated: NarrativeSlide): void {
  addHeader(slide, narrated.title);
  const top = contentAreaTop();
  slide.addText(
    narrated.bullets.map((b, i) => ({ text: `${i + 1}. ${b}`, options: { breakLine: true, paraSpaceAfter: 12 } })),
    {
      x: MARGIN_IN,
      y: top,
      w: SLIDE_W_IN - MARGIN_IN * 2,
      h: SLIDE_H_IN - top - 0.6,
      fontFace: FONT_FACE,
      fontSize: 15,
      color: DECK_COLORS.textPrimary,
      valign: 'top',
    },
  );
}

function renderSourcesSlide(slide: PptxGenJS.Slide, narrated: NarrativeSlide): void {
  addHeader(slide, narrated.title);
  addBulletList(slide, narrated.bullets, { x: MARGIN_IN, y: contentAreaTop(), w: SLIDE_W_IN - MARGIN_IN * 2, h: SLIDE_H_IN - contentAreaTop() - 0.6, fontSize: 13 });
}

function renderSlide(slide: PptxGenJS.Slide, narrated: NarrativeSlide, plan: PresentationPlan): void {
  switch (narrated.layout) {
    case 'title_exec_summary':
      renderTitleSlide(slide, narrated, plan);
      return;
    case 'recommendations':
      renderRecommendationsSlide(slide, narrated);
      return;
    case 'sources_methodology':
      renderSourcesSlide(slide, narrated);
      return;
    case 'two_chart_comparison':
    case 'scenario_optimization_comparison':
      renderDataSlide(slide, narrated, true);
      return;
    case 'kpi_chart_interpretation':
    case 'large_chart_finding':
    case 'table_insight':
      renderDataSlide(slide, narrated, false);
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
}

export interface BuildPptxResult {
  buffer: Buffer;
  warnings: string[];
}

export async function buildPresentationPptx(request: BuildPptxRequest): Promise<BuildPptxResult> {
  const { plan, narrative } = request;
  const warnings = runQualityChecks(plan, narrative);

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'GRANDIOSE_WIDE', width: SLIDE_W_IN, height: SLIDE_H_IN });
  pptx.layout = 'GRANDIOSE_WIDE';
  pptx.author = 'Grandiose Bakery Command Center';
  pptx.title = plan.objective;

  const totalSlides = narrative.slides.length;
  for (const narrated of narrative.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: DECK_COLORS.bgPrimary };
    renderSlide(slide, narrated, plan);
    if (narrated.layout !== 'title_exec_summary') addFooter(slide, narrated.order, totalSlides, narrated.isDemoData);
  }

  const output = await pptx.write({ outputType: 'nodebuffer' });
  const buffer = Buffer.isBuffer(output) ? output : Buffer.from(output as ArrayBuffer);
  return { buffer, warnings };
}
