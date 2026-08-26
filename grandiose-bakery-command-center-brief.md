# Build Brief: Grandiose Bakery Command Center

**For:** Claude Code CLI
**Repo:** `parineetaajain29/GrandioseSupermarket-`
**Author:** Parineeta Jain (GIP III, MGB Oct25, SP Jain), with Rajveer Singh & Tarang Gupta
**Goal:** Build a new, standalone, dark-themed financial command-center page for Grandiose Supermarket's **Bakery Division**, visually cloned from a reference template ("CFO Command Center") but with all content, metrics, and language retargeted to bakery operations. Design system (colors, type, layout rhythm) stays identical to the reference — only the *content* changes.

This page sits alongside the existing Streamlit dashboard (`grandiosesupermarket3.streamlit.app`) as a separate, richer visual centerpiece — e.g. for demos, the portfolio site, or embedding as an iframe/link from Streamlit.

---

## 1. Tech stack

Build as a **standalone React + Vite app** in a new folder in the repo, e.g. `/bakery-command-center`.

- **React 18 + Vite**
- **Recharts** for the band chart (cash/wastage forecast) and bar/waterfall charts
- **D3** (or `d3-sankey`) for the Sankey "money flow" diagram — this is the hardest piece; use `d3-sankey` layout + custom SVG rendering, not a canned chart lib
- **Tailwind CSS** for styling (utility-first matches the design token system below)
- Plain React state (`useState`/`useReducer`) for scenario/period/slider state — no backend needed, all data is local JSON (see §5)
- Deploy target: static build, can be hosted on Vercel/Netlify or dropped into GitHub Pages; keep it decoupled from the Streamlit app

If Claude Code prefers a single-file HTML/JS build (matching the portfolio site's existing pattern of vanilla JS + canvas), that's an acceptable alternative — the component breakdown below still applies, just implemented without JSX.

---

## 2. Design system (unchanged from reference — clone exactly)

### Colors
```
--bg-primary:      #0a0a0f   (near-black page background)
--bg-panel:        #111116   (card/panel background, subtle lift from bg-primary)
--border-subtle:   #23232b   (hairline card borders)
--text-primary:    #f5f5f2   (headings, large numbers)
--text-secondary:  #8a8a94   (labels, captions, eyebrow text)
--accent-blue:     #5b8def   (revenue / "in" flows, primary CTAs, active tab)
--accent-orange:   #e88a3c   (cost / "out" flows, negative deltas, warnings)
--accent-red:      #e0555a   (loss, critical risk)
--accent-green:    #4fd1a5   (positive deltas, healthy status, "low risk")
```
Light theme (toggle): background → `#fcfbf8`, panels → `#ffffff` with `#e8e6df` borders, text inverts to dark charcoal `#1a1a1f`. Accent colors stay the same across both themes — only neutrals invert. Implement as CSS variables / Tailwind theme tokens, not hardcoded hex per component, so the toggle is a single class swap on `<html>`.

### Typography
Reuse the same font stack as the existing portfolio site:
- **Space Grotesk** — headings, KPI numbers, section titles
- **IBM Plex Mono** — eyebrow labels (all-caps, letter-spaced), data table values, monospace numeric readouts (e.g. "50.2 months", "$14.97M")
- Large display numbers use tabular/monospace figures so digits align in tables

### Layout rhythm
- Max-width container, generous padding, cards separated by thin hairline borders (not heavy shadows)
- Section pattern repeated throughout: small monospace eyebrow label → bold Space Grotesk headline → one-line gray description → the visualization
- 5-column KPI strip at the top, each card: eyebrow label, big number, small colored delta line below

---

## 3. Page structure — Grandiose Bakery Command Center

### 3.1 Header
Replace reference copy as follows:

| Reference | Grandiose version |
|---|---|
| "NORTHWIND CLOUD · FINANCIAL REPORTING" | "GRANDIOSE SUPERMARKET · BAKERY DIVISION" |
| "CFO Command Center" | "Bakery Command Center" |
| "Booked results as closed by accounting. Close of July 2026 · 146 employees · books locked by the controller." | "Actual production and cost data as logged by shift supervisors. Close of July 2026 · 112 bakery staff (target: 200) · figures confirmed by division finance." |
| "Template instructions" button | Remove, or repurpose as "About this dashboard" |

Subtitle text must change per scenario tab (same mechanic as reference):
- **Actuals**: "Actual production and cost data as logged by shift supervisors..."
- **GM Target Plan**: "The productivity and cost targets set in the July 27 GM review..."
- **Efficiency Case**: "Projected results if wastage is brought down to the 1% target..."
- **Expansion Case**: "Projected results at full headcount (200) and capacity build-out..."
- **Model a scenario**: "Your custom what-if, built from the levers below."

Subtitle date phrase changes with period granularity exactly like the reference (Month → "Close of July 2026", Quarter → "Close of Q4 FY2026", YTD → "Close of FY2026 through July").

### 3.2 Scenario tabs
Reference: Actuals / Board plan / Efficiency case / Upside case / Model a scenario
→ Grandiose: **Actuals / GM Target Plan / Efficiency Case / Expansion Case / Model a scenario**

### 3.3 Period selector
Keep identical mechanic: M / Q / YTD toggle + scrollable month or quarter buttons.

### 3.4 KPI strip (5 cards)
SaaS metrics don't map 1:1 to a bakery — replace with the metrics that actually matter here, grounded in your GM meeting data:

| Reference KPI | Grandiose KPI | Notes |
|---|---|---|
| ARR | **Monthly Bakery Revenue** | AED, with MoM delta |
| Gross Margin | **Gross Margin** | Keep as-is, same visual treatment |
| Net Burn | **Wastage Cost** | Orange/red like Net Burn — this is bakery's "leak," not company cash burn |
| Runway | **Capacity Utilization** | Green, big number, like Runway — bakery's headroom metric (target ~60-70%, actual ~30-35%) |
| Cash Balance | **Working Capital in Inventory** | AED tied up in flour/dairy/packaging stock |

### 3.5 Hero visualization — Sankey "money flow"
Reference: "Where every dollar went" (Platform Subscriptions → Total Revenue → Cost of Revenue/Gross Profit → cost buckets)

→ Grandiose: **"Where every dirham went"**

Revenue sources (left nodes, blue):
- Retail Bakery Sales
- Arabic Bread (Night Shift)
- Semi-Finished / Wholesale Supply
- Festive & Special Orders

→ **Total Bakery Revenue** → splits into:
- **Cost of Production** (orange) → Flour & Grains, Dairy & Butter, Packaging, Utilities & Ovens
- **Gross Profit** (blue) → Labor, Wastage, Distribution & Logistics, Maintenance & Equipment, Admin & Overheads

Keep hover-to-trace interaction, keep the "OP. MARGIN" readout top-right (rename to reflect bakery operating margin), keep the summary row below (Total Revenue / Cost of Production / Gross Profit / Operating Expense / Operating Result).

### 3.6 "13-week forecast" module
Reference: 13-week cash forecast with P25–P75/P10–P90 bands, draggable "incremental hiring spend" slider, "Runway exhausts" readout.

→ Grandiose: **"13-week wastage & capacity forecast"**
- Band chart tracks projected **wastage rate (%)** trending toward or away from the 1% target, with uncertainty bands
- What-if slider: **"Incremental headcount hiring"** (toward the 200 target, from current ~112), $0–driven by AED cost per hire
- Live readout: **"Capacity utilization reaches [X]% by [month]"** instead of "Runway exhausts [date]" — same mechanic, bakery-relevant output

Alternative (simpler, if preferred): keep it as a genuine **cash forecast** but relabeled with bakery language — "Anchored on cash position at end of July 2026. Drag the handle to reprice the hiring plan toward 200 headcount."

### 3.7 "AR aging" module → reframe as procurement/supplier risk
Reference: AR aging & collection risk, customer-level table with risk badges.

Catering is out of scope and Grandiose's bakery is primarily retail (not heavy B2B receivables), so directly cloning AR aging doesn't fit. Reframe using your real procurement data instead:

→ **"Supplier & procurement risk"**
- Headline stat row: "~68 approved vendors · 95% on 90-day payment terms · 3-month safety stock maintained"
- Horizontal bar: vendor concentration by category (Flour, Dairy/Butter, Packaging, Other) instead of aging buckets
- Table columns: **Supplier / Category / Dependency (Single vs Dual-sourced) / Lead Time (days) / Risk** — flour and butter marked "Dual-sourced" (Low risk), single-sourced categories flagged Watch/High
- Filter: "Single-sourced only" instead of "At-risk only"
- Sort: Lead time / Spend / A–Z

This keeps the exact visual pattern (stat row → horizontal segmented bar → filterable/sortable table with colored risk pills) while being data-honest to your actual project scope.

### 3.8 "Budget vs Actual" waterfall
Reference: Operating income variance waterfall (Budget → Platform/Usage/Services/Mktplace/COGS/R&D/S&M/G&A → Actual), with click-to-explain bars and AI-generated commentary toggle.

→ Grandiose: **"Production cost variance"**
- Waterfall: Budget → Flour → Dairy/Butter → Packaging → Labor → Wastage → Utilities → Admin → Actual
- Keep "Generate commentary" AI toggle — this is a great genuine use for the Anthropic API you're already using in the Data Processor feature; each bar's plain-English explanation can literally be generated via `claude-sonnet-5`
- Net variance readout stays, same red/orange/green logic

---

## 4. Interactivity checklist (must all work, not just render)

- [ ] Scenario tabs swap KPI values, subtitle copy, and Sankey figures
- [ ] Period toggle (M/Q/YTD) swaps month/quarter buttons, relabels KPI captions ("vs prior month" → "vs prior quarter" → "vs prior year to date"), and updates the subtitle date phrase
- [ ] Sankey diagram: hover any node/ribbon highlights and traces its full path end-to-end
- [ ] Forecast slider: dragging recalculates the live readout number in real time (no submit button)
- [ ] Supplier table: filter toggle + 3 sort modes actually resort/filter the visible rows
- [ ] Waterfall bars: click opens a plain-English explanation (can be static per-bar copy to start; AI-generated is a stretch goal)
- [ ] Light/dark theme toggle swaps the full palette instantly, no flash

---

## 5. Placeholder data model

Ship as a local `data/scenarios.json` (or TS const) so it's trivial to swap in real numbers later. Example shape for one scenario/period cell:

```json
{
  "actuals": {
    "month": {
      "Jul": {
        "subtitle": "Actual production and cost data as logged by shift supervisors.",
        "kpis": {
          "revenue": { "value": 1850000, "delta": 2.4, "unit": "AED" },
          "grossMargin": { "value": 34.2, "delta": 0.6 },
          "wastageCost": { "value": 42600, "delta": 8.1 },
          "capacityUtilization": { "value": 32.4, "delta": 1.1 },
          "workingCapital": { "value": 612000, "delta": -3.2 }
        },
        "sankey": {
          "revenue": [
            { "name": "Retail Bakery Sales", "value": 1180000 },
            { "name": "Arabic Bread (Night Shift)", "value": 340000 },
            { "name": "Semi-Finished / Wholesale", "value": 220000 },
            { "name": "Festive & Special Orders", "value": 110000 }
          ],
          "costOfProduction": [
            { "name": "Flour & Grains", "value": 210000 },
            { "name": "Dairy & Butter", "value": 165000 },
            { "name": "Packaging", "value": 58000 },
            { "name": "Utilities & Ovens", "value": 47000 }
          ],
          "opex": [
            { "name": "Labor", "value": 520000 },
            { "name": "Wastage", "value": 42600 },
            { "name": "Distribution & Logistics", "value": 61000 },
            { "name": "Maintenance & Equipment", "value": 33000 },
            { "name": "Admin & Overheads", "value": 74000 }
          ]
        }
      }
    }
  }
}
```

Use realistic but clearly placeholder numbers consistent with what's already known about Grandiose's bakery (capacity utilization 30–35%, wastage 2–3% vs 1% target, ~112 of a 200 headcount target, 9-hour shifts, Arabic Bread night shift, ~68 vendors on 90-day terms, dual-sourced flour/butter). Mark the file header clearly as `// PLACEHOLDER DATA — replace with real GM meeting / finance figures before external use`.

---

## 6. File structure in repo

```
/bakery-command-center
  /src
    /components
      Header.tsx
      ScenarioTabs.tsx
      PeriodSelector.tsx
      KpiStrip.tsx
      SankeyMoneyFlow.tsx
      ForecastModule.tsx
      SupplierRiskTable.tsx
      VarianceWaterfall.tsx
      ThemeToggle.tsx
    /data
      scenarios.json
    /styles
      tokens.css        (the color/font variables from §2)
    App.tsx
    main.tsx
  index.html
  tailwind.config.js
  vite.config.ts
  package.json
  README.md            (brief note: what this is, how it relates to the main Streamlit dashboard, placeholder-data disclaimer)
```

---

## 7. Build order (suggested task sequence for Claude Code)

1. Scaffold Vite + React + Tailwind, wire up `tokens.css` and the light/dark toggle first — get the shell and theme system right before any charts
2. Build `Header`, `ScenarioTabs`, `PeriodSelector`, `KpiStrip` — static layout, wired to `scenarios.json`, no charts yet
3. Build `SankeyMoneyFlow` with `d3-sankey` — hardest piece, do it in isolation with one static dataset first, then wire to scenario state
4. Build `ForecastModule` (Recharts area/band chart + slider)
5. Build `SupplierRiskTable` (filter/sort logic)
6. Build `VarianceWaterfall` (Recharts bar chart styled as waterfall, or custom SVG)
7. Wire all components to shared scenario/period state so switching tabs updates everything at once
8. Polish: hover states, transitions, responsive breakpoints, README

---

## 8. What NOT to change

- Do not alter the color palette, font choices, card/border treatment, or spacing rhythm from §2 — the brief for this project is "same look, new content"
- Do not add catering-related metrics anywhere (explicitly out of scope per project brief)
- Keep AED as the currency throughout, not $
