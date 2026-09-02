# Bakery Command Center

A standalone, dark-themed financial command-center dashboard for Grandiose Supermarket's **Bakery Division**. It's a visual clone of a reference CFO/finance-SaaS dashboard template — same design system (colors, type, layout rhythm, card patterns, interactivity) — with every heading, metric, and data label retargeted to bakery production, cost, and procurement.

It sits alongside the existing Streamlit dashboard (`grandiosesupermarket3.streamlit.app`) as a separate, richer visual centerpiece — for demos, the portfolio site, or embedding as an iframe/link from Streamlit. It does not replace or read from Streamlit; it's a fully static, standalone app with its own local data.

**⚠️ Placeholder data.** Every figure comes from `src/data/scenarios.json`, which is explicitly marked as realistic-but-fictional placeholder data. Replace it with real GM meeting / division finance figures before using this externally. See the build brief (`grandiose-bakery-command-center-brief.md` at the repo root) for the full data/design spec this was built from.

## Stack

React 18 + TypeScript + Vite, Tailwind CSS v4, Recharts, and `d3-sankey` for the hero money-flow diagram. No backend — all state is local React state driven by the bundled JSON.

## Run it

```bash
npm install
npm run dev      # dev server
npm run build    # production build to dist/
```

## Structure

```
src/
  components/   Header, ScenarioTabs, PeriodSelector, KpiStrip,
                SankeyMoneyFlow, ForecastModule, SupplierRiskTable,
                VarianceWaterfall, ModelScenarioLevers, ThemeToggle
  data/         scenarios.json (placeholder data), types.ts, derive.ts
                (Sankey derivation + forecast/model-scenario math)
  lib/          theme.tsx (light/dark context), format.ts
  styles/       tokens.css (design tokens from the brief)
```

## Known data gaps (see derive.ts for exact methodology)

`scenarios.json` only ships a fully-specified Sankey and cost-variance waterfall for **Actuals · July**. To keep every scenario tab and period button "live" without inventing new revenue/cost figures:

- **Sankey**: for any other scenario/period, the diagram is derived from that cell's own revenue, gross margin %, and wastage cost (all real numbers), distributed using the *relative mix* of the one fully-specified Jul-actuals cell. Flagged in-app as "modeled from Jul actuals mix, scaled to this scenario."
- **Variance waterfall**: only shown for Actuals · Month · Jul, since a budget-vs-actual comparison only makes sense against booked actuals — the other tabs are forward-looking projections, not results to reconcile against a budget.
- **"Model a scenario" levers**: hiring interpolates between Actuals and Expansion Case; wastage target interpolates between Actuals and Efficiency Case — both anchored to real data points already in `scenarios.json`, not a fabricated formula.
