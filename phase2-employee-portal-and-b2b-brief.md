# Build Brief: Employee Portal Rework + B2B Client Performance Page

**For:** Claude Code CLI
**Repo:** `parineetaajain29/grandiose-bakery-command-center`
**App:** `/bakery-command-center` (existing React + Vite + Tailwind + Recharts + d3-sankey build)
**Author:** Parineeta Jain, with Rajveer Singh & Tarang Gupta — GIP III, SP Jain

Two features, both requested directly by Grandiose after a client review. Feature A is a **correctness** job — the client explicitly asked that the numbers be right to the decimal. Feature B is a **new page**.

Design system, fonts, and colour tokens are unchanged — reuse exactly what's already in `src/styles/tokens.css` and the existing self-hosted Space Grotesk / IBM Plex Mono setup. Do not introduce new fonts, palettes, or card treatments.

---

# FEATURE A — Employee Portal: correct the labour calculations

## A1. Why this is being changed

The current portal computes a rough efficiency figure. The client wants the full labour economics chain visible and arithmetically exact: paid hours → deductions → productive hours → cost per productive hour → revenue per labour dirham. They will check the numbers.

## A2. The calculation chain — implement exactly

All intermediate values carry **full float precision**. Round **only at the point of display**. Never round an intermediate and feed it into the next step.

```
paidHours        = shiftLengthHours × daysWorked
                   shiftLengthHours = 9.0  (NOT 8 — this is a documented Grandiose value)

breakHours       = breakMinutesPerShift / 60 × daysWorked

availableHours   = paidHours
                   − (breaksArePaid ? 0 : breakHours)
                   − changeoverHours
                   − machineDowntimeHours

productiveHours  = availableHours − idleWaitingHours

utilisationPct   = availableHours / paidHours × 100
trueEfficiencyPct= productiveHours / paidHours × 100

costPerProductiveHour = totalSalaryCost / productiveHours
revenuePerLabourDirham = revenueAttributed / totalSalaryCost
revenuePerDay          = revenueAttributed / daysWorked
```

**Report both `utilisationPct` and `trueEfficiencyPct`.** They answer different questions (how much paid time was available vs. how much of paid time actually produced) and collapsing them into one number is what makes the current figure unclear.

## A3. The breaks config flag — IMPORTANT

Whether breaks are paid or unpaid at Grandiose is **not yet confirmed with the GM**. Build this as a single config constant, not a hardcoded assumption:

```ts
// src/config/labourConfig.ts
export const LABOUR_CONFIG = {
  shiftLengthHours: 9.0,
  breaksArePaid: true,          // TODO: CONFIRM WITH GM — flipping this changes every efficiency figure
  breakMinutesPerShift: 35,     // TODO: CONFIRM WITH GM
  revenueAttributionBasis: 'allocated' as const,
} as const;
```

Every calculation must read from this object. Flipping `breaksArePaid` should correctly change all downstream figures with no other edits. Add a short comment block above it explaining that unpaid breaks are deducted from the paid-hours denominator while paid breaks are not.

Surface this in the UI as a small muted footnote under the hours breakdown: `Breaks treated as paid — pending confirmation.` (or unpaid, driven by the flag). The client should be able to see which assumption produced the number.

## A4. Revenue attribution

Confirmed decision: non-production departments (QC, packing & dispatch, admin) receive an **allocated share of division revenue**, not a direct attribution.

```
revenueAttributed = divisionRevenue × allocationWeight
```

Implement `allocationWeight` as a per-department value in the data file, and document the basis in a comment (headcount / hours / direct cost — record whichever the data reflects). Direct production departments attribute actual output value; support departments use the allocation.

Add a one-line note in the UI where a support department is shown: `Revenue allocated, not directly attributed.` Do not let a support department's efficiency read as if it directly generated sales.

## A5. Display precision

| Value | Format |
|---|---|
| Hours | 2 decimals (`165.40`) |
| Percentages | 1 decimal (`71.6%`) |
| Currency AED | 2 decimals, thousands separator (`AED 4,200.00`) |
| Ratios (revenue per labour dirham) | 2 decimals + `×` (`6.23×`) |

Use `Intl.NumberFormat` for currency. Use `.toFixed(n)` for hours and percentages. Never let a raw float reach the DOM — JS float artefacts (`0.1 + 0.2`) will be visible and will undermine the client's confidence in the whole dashboard.

## A6. Employee card layout

Rework the existing employee card to show the chain, not just the result:

1. **Header** — initials avatar, name, department + shift, and `trueEfficiencyPct` as the large right-aligned figure (green ≥ 85%, amber 70–85%, red < 70%)
2. **Stacked horizontal bar** — productive / changeover / downtime / breaks, proportional, with a small legend showing hours for each
3. **Deduction table** — monospace, right-aligned figures, showing paid hours then each subtraction then productive hours on a bordered total row. This is the part that makes the number defensible.
4. **Labour economics grid** — four metric cards: salary cost, cost per productive hour, revenue attributed, revenue per labour dirham
5. **Benchmark footer** — actual AED/day against the documented **AED 1,000/day GM productivity benchmark**, with variance percentage

## A7. Department rollup

Aggregate the same chain at department level across all 13 departments. Critical: aggregate **hours**, then compute percentages from the aggregated hours. Do **not** average individual employees' percentages — that gives the wrong answer whenever employees worked different numbers of days.

## A8. Tests — required, not optional

Add unit tests (`vitest`) covering:
- A worked example with known inputs and hand-verified outputs
- `breaksArePaid: true` vs `false` produce the expected different results
- Department rollup equals the chain computed on summed hours, not the mean of percentages
- Zero productive hours does not produce `Infinity` or `NaN` in cost-per-hour — return `null` and render `—`

---

# FEATURE B — B2B client performance page

## B1. Purpose

Flour Country / Grandiose Bakery is expanding into B2B. This page keeps management informed on how that expansion is performing, at account and location level. The core insight it must surface: **revenue-positive accounts can be margin-negative once service cost is included, and margin looks different again once idle capacity is accounted for.**

## B2. Page structure — build in this order, top to bottom

**Sub-navigation** — pill row: Overview · Client list · Orders · Production load · Receivables. Only Overview needs to be functional in this build; the others render an "Coming in a later phase" placeholder. Match the existing scenario-tab pill styling.

**Search bar** — client name or order ID, filters the account table live. No backend, filter the local array.

**KPI strip (4 cards)** — reuse the existing KPI card component exactly:
- B2B revenue (AED, MoM delta)
- Net margin after service cost (%, delta vs retail margin)
- OTIF rate (%, count of late drops)
- Average collection days (vs 90-day supplier terms as context)

**Hero chart — revenue vs service cost, 13 weeks.** Two-line Recharts chart, revenue in green, service cost in amber. Hover shows week label and both values. Subtitle: `The gap between the lines is your margin. Watch for convergence.` This framing matters — the chart's job is to show margin compression early.

**Capacity economics panel.** A horizontal stacked bar showing retail / B2B / idle share of oven capacity (currently ~32.4% utilised, so idle is the dominant block). Below it, two contrasting figures: marginal margin when an order lands in idle capacity vs. when it forces overtime. Plus a line showing how many of next week's orders fall into overtime slots.

```
marginalContribution = orderValue
                       − ingredientCost − packagingCost − deliveryCost
                       − incrementalLabourCost        // ~0 if idle capacity absorbs it
                       − overtimePremium              // 0 unless the slot forces overtime
marginalMarginPct    = marginalContribution / orderValue × 100
```

Add a caveat line in the UI: `Marginal view assumes fixed costs are absorbed by retail volume. Holds while utilisation stays low.` This is honest and the client's finance team will respect it.

**Concentration risk panel.** Top-2 accounts as a percentage of B2B revenue, a proportional segmented bar of all accounts, and a plain-English consequence line (`Losing [top account] would cut B2B revenue by nearly a third.`). This mirrors the existing supplier concentration module — reuse that visual pattern, pointed at customers instead of vendors.

**Account profitability table.** Columns: Client (with location + delivery frequency as a monospace subline), Revenue, Margin, **Marginal**, OTIF. Sortable by any column, filterable by the search bar.

The **Marginal column next to Margin is the point of the table** — it shows that an account can be negative on full absorption but positive at the margin because it fills idle capacity. Add a footnote explaining exactly that for whichever account it applies to.

Colour: green / amber / red on margin and marginal per thresholds; OTIF red below 90%.

**Receivables panel.** Total outstanding, amount past 60 days, aging bars (0–30 / 31–60 / 61–90 / 90+), and an "Export statement" button (CSV of the account table is fine for this build).

**Recent deliveries feed.** Client initials avatar, name, location + time + on-time/late status, value. Late deliveries show the delay in red — this is the raw material behind the OTIF metric and makes it feel real rather than abstract.

## B3. Data

Extend `src/data/scenarios.json` with a `b2b` block. Keep the existing `// PLACEHOLDER DATA` header convention. Suggested shape:

```json
"b2b": {
  "summary": { "revenue": 412000, "netMarginPct": 21.4, "otifPct": 94.2, "collectionDays": 47 },
  "weeklyTrend": [ { "week": 1, "revenue": 24100, "serviceCost": 3980 } ],
  "capacity": { "retailPct": 24.0, "b2bPct": 8.4, "idlePct": 67.6, "ordersInOvertimeSlots": 4, "ordersNextWeek": 38 },
  "clients": [
    {
      "name": "Al Manzil Hotels", "location": "Deira", "frequency": "weekly bulk",
      "revenue": 118400, "serviceCost": 4210, "marginPct": 31.2, "marginalMarginPct": 44.1,
      "otifPct": 99.1, "paymentTermsDays": 30
    }
  ],
  "receivables": { "total": 187000, "past60": 41000, "buckets": [63000, 83000, 25000, 16000] },
  "recentDeliveries": [
    { "client": "Al Manzil Hotels", "location": "Deira", "time": "06:15", "onTime": true, "value": 4820 }
  ]
}
```

Use realistic placeholder figures consistent with what's already known about the division. Make client revenues sum to the summary revenue figure — the client will add them up.

## B4. Files

```
src/config/labourConfig.ts
src/lib/labourCalc.ts              // pure functions, fully unit tested
src/lib/labourCalc.test.ts
src/lib/b2bCalc.ts                 // marginal contribution, concentration, aggregations
src/components/employee/EmployeeCard.tsx
src/components/employee/DepartmentRollup.tsx
src/components/b2b/B2BPage.tsx
src/components/b2b/B2BSubNav.tsx
src/components/b2b/RevenueVsCostChart.tsx
src/components/b2b/CapacityEconomics.tsx
src/components/b2b/ConcentrationRisk.tsx
src/components/b2b/AccountTable.tsx
src/components/b2b/ReceivablesPanel.tsx
src/components/b2b/DeliveryFeed.tsx
```

Keep all arithmetic in `labourCalc.ts` and `b2bCalc.ts` as pure functions. Components format and render; they must not compute. This is what makes the numbers testable and the client's "right to the decimal" requirement verifiable.

## B5. Build order

1. `labourConfig.ts` + `labourCalc.ts` + tests — get the maths provably correct before any UI
2. Rework `EmployeeCard` against the tested functions
3. `DepartmentRollup`
4. `b2bCalc.ts` + tests
5. B2B page shell, sub-nav, KPI strip
6. Revenue vs service cost chart
7. Capacity economics + concentration panels
8. Account table with sort and search
9. Receivables + delivery feed
10. Wire B2B into the app's existing navigation

## B6. Constraints

- Do not change the colour palette, fonts, card styling, or spacing rhythm
- Currency is AED throughout, never `$`
- No catering metrics anywhere — out of scope for this project
- Do not invent figures inside components; everything comes from `scenarios.json`
- Where a value depends on an unconfirmed assumption (breaks, allocation basis), show a muted footnote saying so rather than presenting it as settled

## B7. On finishing

Report: what was built, the unit test results for the labour chain, any deviations and why, and an explicit list of every value still pending GM confirmation so it can be chased.
