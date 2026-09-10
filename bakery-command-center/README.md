# Bakery Command Center

A standalone, dark-themed financial command-center dashboard for Grandiose Supermarket's **Bakery Division**. It's a visual clone of a reference CFO/finance-SaaS dashboard template — same design system (colors, type, layout rhythm, card patterns, interactivity) — with every heading, metric, and data label retargeted to bakery production, cost, and procurement.

It sits alongside the existing Streamlit dashboard (`grandiosesupermarket3.streamlit.app`) as a separate, richer visual centerpiece — for demos, the portfolio site, or embedding as an iframe/link from Streamlit. It does not replace or read from Streamlit; it's a fully static, standalone app with its own local data.

**⚠️ Placeholder data.** Every figure comes from `src/data/scenarios.json`, which is explicitly marked as realistic-but-fictional placeholder data. Replace it with real GM meeting / division finance figures before using this externally. See the build brief (`grandiose-bakery-command-center-brief.md` at the repo root) for the full data/design spec this was built from.

## Stack

React 19 + TypeScript + Vite, Tailwind CSS v4, Recharts, and `d3-sankey` for the hero money-flow diagram. Most of the app (Command Center, B2B) is still local React state driven by the bundled JSON.

The **Employee Portal** is backed by a real local server + database: Express + `node:sqlite` (built into Node 24, no native dependencies — the point is that this can run unmodified on Grandiose's own desktop, not just a dev laptop). See `server/`.

Every employee has an individual login (4-digit PIN, hashed with `crypto.scryptSync`) — this is **attribution only**: logging in doesn't restrict what you can see or do, it just stamps who saved each log entry, so `EmployeeCard` can show "Last logged by …". `npm run db:seed` prints each employee's demo PIN to the console; there's no self-service PIN reset yet.

## Run it

```bash
npm install
npm run db:seed  # one-time (or after schema changes): creates & seeds server/data/bakery.db
npm run dev      # starts Vite + the API server together
npm run build    # production build to dist/
```

To run it the way it would run on Grandiose's desktop (one process, one port, no separate dev servers):

```bash
npm run build
npm run db:seed   # first time only
npm start         # serves the built frontend + API from http://localhost:3001
```

## Structure

```
src/
  components/   Header, ScenarioTabs, PeriodSelector, KpiStrip,
                SankeyMoneyFlow, ForecastModule, SupplierRiskTable,
                VarianceWaterfall, ModelScenarioLevers, ThemeToggle
                employee/  Employee Portal (server-backed, see server/)
                b2b/       B2B client performance page
  config/       labourConfig.ts — the breaksArePaid / shift-length config (brief §A3)
  data/         scenarios.json (placeholder data — also the seed source for
                the employee portal DB), types.ts, derive.ts (Sankey/forecast
                math + employee-portal rollups), api.ts (fetches the employee
                portal from the server)
  lib/          theme.tsx (light/dark context), format.ts, labourCalc.ts +
                b2bCalc.ts (pure, unit-tested arithmetic — see *.test.ts)
  styles/       tokens.css (design tokens from the brief)

server/
  db.ts         SQLite schema + migrations (node:sqlite, server/data/bakery.db — gitignored)
  auth.ts       PIN hashing (scrypt) + hand-rolled cookie sessions, no extra deps
  seed.ts       seeds departments/employees/history/demo PINs from scenarios.json
                (`npm run db:seed` — prints each employee's PIN to the console)
  routes/       employeePortal.ts (GET /api/employee-portal, POST /api/labour-logs
                + /api/period-meta, both requiring login), auth.ts (login/logout/me)
  index.ts      Express app — dev: API only (Vite proxies /api to it);
                production: also serves the built dist/ from the same port
```

## Known data gaps (see derive.ts for exact methodology)

`scenarios.json` only ships a fully-specified Sankey and cost-variance waterfall for **Actuals · July**. To keep every scenario tab and period button "live" without inventing new revenue/cost figures:

- **Sankey**: for any other scenario/period, the diagram is derived from that cell's own revenue, gross margin %, and wastage cost (all real numbers), distributed using the *relative mix* of the one fully-specified Jul-actuals cell. Flagged in-app as "modeled from Jul actuals mix, scaled to this scenario."
- **Variance waterfall**: only shown for Actuals · Month · Jul, since a budget-vs-actual comparison only makes sense against booked actuals — the other tabs are forward-looking projections, not results to reconcile against a budget.
- **"Model a scenario" levers**: hiring interpolates between Actuals and Expansion Case; wastage target interpolates between Actuals and Efficiency Case — both anchored to real data points already in `scenarios.json`, not a fabricated formula.
