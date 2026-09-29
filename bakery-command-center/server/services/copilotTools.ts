// Grandiose Copilot's tool layer (Phase 2 of the implementation plan).
//
// Every function here is the one place Copilot is allowed to touch real data.
// The LLM never calls these directly and never sees a raw DB row — the
// copilot route classifies which tool to call and with what params, calls it
// itself in plain TypeScript, and only then (optionally) hands the LLM the
// already-verified result to narrate. That split is what prevents a
// hallucinated number: the model literally has no path to the database.
//
// Every function that touches employee-scoped data takes `session` as its
// first argument and does its OWN permission check via rbac.ts — exactly the
// same pattern every existing route already follows (see rbac.ts's own
// comment: hiding a button is not access control). Never trust a tool's
// caller to have already filtered anything; never trust the LLM's classified
// "who this is about" without re-deriving it from the session here.
//
// Company-wide tools (SKU, B2B, Command Center attention items) read from the
// same static scenariosFile/skuData bundle the rest of the app already reads
// from client-side — nothing new is invented, and nothing here duplicates a
// formula that already lives in src/lib/*.ts. This file wraps those pure
// functions; it does not recompute anything they already compute.

import { requireRole } from '../rbac.ts';
import type { EmployeeSession } from '../auth.ts';
import type { Response } from 'express';
import { getEmployees, type EmployeeRow } from './employees.ts';
import { getComparativeMetrics, type ComparativeMetrics } from './metrics.ts';
import { scenariosFile, computeModelScenarioKpis } from '../../src/data/index.ts';
import { computeAttentionItems, wastagePctFromKpis, type AttentionItem } from '../../src/lib/commandCenterSignals.ts';
import { loadProducts, divisionSummary, type Sku } from '../../src/lib/skuCalc.ts';
import { RAW_PRODUCTS, DIVISIONS, type Division } from '../../src/data/skuData.ts';
import { deriveB2BSummary, deriveReceivables } from '../../src/lib/b2bCalc.ts';
import type { PeriodCell } from '../../src/data/types.ts';

// ---------------------------------------------------------------------------
// Shared result shape every tool returns. `source` is what the UI's "Based
// on:" line shows (§19 of the spec) — plain text naming the real page/data
// this came from, never invented. `data` is the ONLY place a number may
// travel from tool → route → (optional) LLM explanation → user.
// ---------------------------------------------------------------------------
export interface ToolError {
  ok: false;
  code: 'permission_denied' | 'no_data' | 'not_found' | 'ambiguous';
  message: string;
  /** Only set for code:'ambiguous' — e.g. two employees matching "Ahmed". */
  candidates?: { id: string; label: string }[];
}

export interface ToolSuccess<T> {
  ok: true;
  source: string;
  data: T;
}

export type ToolResult<T> = ToolSuccess<T> | ToolError;

/**
 * Recursively rounds every finite number in a value to at most `decimals`
 * places (default 2). Computed figures like True Efficiency come out of
 * labourCalc.ts as raw division results (74.81767279913424, not 74.82) — the
 * app's own React components format those at display time with toFixed(1),
 * but Copilot hands this data straight to explainResult, which is
 * deliberately forbidden from rounding numbers itself (that would count as
 * "recalculating"). So the rounding has to happen here, once, at the
 * source — every tool result is clean before it ever reaches the LLM, the
 * UI's evidence panel, or conversation history.
 */
function roundNumbers<T>(value: T, decimals = 2): T {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return value;
    const factor = 10 ** decimals;
    return (Math.round(value * factor) / factor) as unknown as T;
  }
  if (Array.isArray(value)) return value.map((v) => roundNumbers(v, decimals)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = roundNumbers(v, decimals);
    }
    return result as T;
  }
  return value;
}

function ok<T>(data: T, source: string): ToolSuccess<T> {
  return { ok: true, source, data: roundNumbers(data) };
}

function err(code: ToolError['code'], message: string, candidates?: ToolError['candidates']): ToolError {
  return { ok: false, code, message, candidates };
}

// ---------------------------------------------------------------------------
// Employee name resolution — every "who/compare/rank employee" question
// starts here. Deliberately NOT exposed to the LLM as free SQL: it's a plain
// case-insensitive substring match against the same employees table every
// other route already reads. Ambiguity ("two Ahmeds") is surfaced as data,
// not silently resolved to the first match — the spec's own test case #14.
// ---------------------------------------------------------------------------
export function resolveEmployeeByName(session: EmployeeSession, nameQuery: string): ToolResult<EmployeeRow> {
  const q = nameQuery.trim().toLowerCase();
  if (q === '') return err('not_found', 'No employee name was given.');

  const visibleIds = scopeToIdSet(session);
  const matches = getEmployees('all').filter(
    (e) => e.active && e.name.toLowerCase().includes(q) && (visibleIds === 'all' || visibleIds.has(e.id)),
  );

  if (matches.length === 0) {
    // Distinguish "doesn't exist" from "exists but you can't see them" only
    // by re-checking without the scope filter — never reveal WHO the hidden
    // match is, only that access is the reason, matching rbac.ts's model.
    const existsButHidden = getEmployees('all').some((e) => e.active && e.name.toLowerCase().includes(q));
    if (existsButHidden) return err('permission_denied', `You're not authorised to view that employee's data.`);
    return err('not_found', `No active employee matches "${nameQuery}".`);
  }
  if (matches.length > 1) {
    return err(
      'ambiguous',
      `Found ${matches.length} employees matching "${nameQuery}". Which one?`,
      matches.map((e) => ({ id: e.id, label: `${e.name} (${e.department})` })),
    );
  }
  return ok(matches[0], 'Employee Directory');
}

/** Every employee id this session may resolve a name to — mirrors rbac.ts's scopeEmployeeIds but returns a Set for fast lookup, and 'all' stays a sentinel rather than materializing every id. */
function scopeToIdSet(session: EmployeeSession): Set<string> | 'all' {
  if (session.role === 'manager' || session.role === 'hr_admin') return 'all';
  if (session.role === 'supervisor') {
    return new Set(getEmployees('all').filter((e) => e.department === session.department).map((e) => e.id));
  }
  return new Set([session.employeeId]);
}

// ---------------------------------------------------------------------------
// Employee comparison — "who has the highest/lowest true efficiency", "compare
// X with their division". Wraps getComparativeMetrics (already role-agnostic
// at the DB layer) behind the same canViewEmployee check every other
// employee-data route uses.
// ---------------------------------------------------------------------------
export interface EmployeeComparisonResult extends ComparativeMetrics {
  employeeName: string;
  fromDate: string;
  toDate: string;
}

/** Default window: trailing 365 days. There's no "current period" concept for daily logs the way Command Center has scenario/month — a wide window means a genuinely empty range is reported honestly (§26) rather than narrowed until something appears. */
function defaultDateRange(): { fromDate: string; toDate: string } {
  const toDate = new Date();
  const fromDate = new Date(toDate);
  fromDate.setDate(fromDate.getDate() - 365);
  return { fromDate: fromDate.toISOString().slice(0, 10), toDate: toDate.toISOString().slice(0, 10) };
}

export function getEmployeeComparison(
  session: EmployeeSession,
  employeeId: string,
  range?: { fromDate: string; toDate: string },
): ToolResult<EmployeeComparisonResult> {
  const employee = getEmployees('all').find((e) => e.id === employeeId);
  if (!employee) return err('not_found', 'That employee no longer exists.');

  const scope = scopeToIdSet(session);
  if (scope !== 'all' && !scope.has(employeeId)) {
    return err('permission_denied', `You're not authorised to view ${employee.name}'s data.`);
  }

  const { fromDate, toDate } = range ?? defaultDateRange();
  const comparison = getComparativeMetrics(employeeId, fromDate, toDate);
  if (!comparison) return err('not_found', 'That employee no longer exists.');
  if (comparison.employee.paidMinutes === 0) {
    return err('no_data', `No daily-log data for ${employee.name} in the selected period.`);
  }

  return ok(
    { ...comparison, employeeName: employee.name, fromDate, toDate },
    `Employee Portal · ${employee.name} vs. ${comparison.departmentName} vs. bakery · ${fromDate} to ${toDate}`,
  );
}

/**
 * "Which employee needs attention?" — ranks every employee visible to this
 * session by the GAP between True Efficiency and their own department
 * average, not by a raw score, and carries BOTH trueEfficiencyPct and
 * performanceWhileWorkingPct so the caller can distinguish "genuinely low
 * output" from "normal output, but paid-time availability was the problem"
 * (spec §15 — never let a downtime-driven gap read as a personnel judgment).
 * Employees with no logs in range are excluded, not scored as 0.
 */
export interface AttentionCandidate {
  employeeId: string;
  employeeName: string;
  department: string;
  trueEfficiencyPct: number;
  performanceWhileWorkingPct: number | null;
  departmentTrueEfficiencyPct: number;
  gapPct: number;
  /** true when performanceWhileWorkingPct is close to the department norm despite a low trueEfficiencyPct — i.e. the likely driver is availability/downtime, not execution. */
  likelyAvailabilityDriven: boolean;
}

export function getEmployeesNeedingAttention(
  session: EmployeeSession,
  range?: { fromDate: string; toDate: string },
): ToolResult<AttentionCandidate[]> {
  const scope = scopeToIdSet(session);
  if (scope !== 'all' && scope.size === 0) return err('no_data', 'No employees in scope.');

  const { fromDate, toDate } = range ?? defaultDateRange();
  const candidates = getEmployees('all').filter((e) => e.active && (scope === 'all' || scope.has(e.id)));
  if (candidates.length === 0) return err('no_data', 'No employees in scope.');

  const results: AttentionCandidate[] = [];
  for (const employee of candidates) {
    const comparison = getComparativeMetrics(employee.id, fromDate, toDate);
    if (!comparison || comparison.employee.paidMinutes === 0) continue; // no logs — excluded, not scored as failing
    const gapPct = comparison.department.trueEfficiencyPct - comparison.employee.trueEfficiencyPct;
    results.push({
      employeeId: employee.id,
      employeeName: employee.name,
      department: comparison.departmentName,
      trueEfficiencyPct: comparison.employee.trueEfficiencyPct,
      performanceWhileWorkingPct: comparison.employee.performanceWhileWorkingPct,
      departmentTrueEfficiencyPct: comparison.department.trueEfficiencyPct,
      gapPct,
      likelyAvailabilityDriven:
        comparison.employee.performanceWhileWorkingPct !== null &&
        comparison.employee.performanceWhileWorkingPct >= comparison.department.trueEfficiencyPct - 5,
    });
  }

  if (results.length === 0) return err('no_data', 'No employees with logged data in the selected period.');
  results.sort((a, b) => b.gapPct - a.gapPct);
  return ok(results, `Employee Portal · comparative True Efficiency vs. department · ${fromDate} to ${toDate}`);
}

// ---------------------------------------------------------------------------
// SKU ranking — "highest contribution in Baklava", "top SKU". No role check:
// SKU Performance is visible to supervisor/manager/hr_admin already and
// carries no individual-employee data; the route layer still requires at
// least one of those roles before calling this, matching the page's own
// getAllowedPages() gate.
// ---------------------------------------------------------------------------
export type SkuMetric = 'contribution' | 'revenue' | 'units';

export function getSkuRanking(division: Division | null, metric: SkuMetric, limit = 5): ToolResult<Sku[]> {
  let products = loadProducts(RAW_PRODUCTS);
  if (division) {
    if (!DIVISIONS.includes(division)) return err('not_found', `"${division}" isn't a known division.`);
    products = products.filter((p) => p.division === division);
  }
  if (products.length === 0) return err('no_data', `No SKUs found${division ? ` in ${division}` : ''}.`);

  const key = metric === 'contribution' ? 'contributionPct' : metric === 'revenue' ? 'salesAed' : 'units';
  const ranked = [...products].sort((a, b) => b[key] - a[key]).slice(0, limit);
  return ok(ranked, `SKU Performance${division ? ` · ${division}` : ''} · ranked by ${metric}`);
}

export function getDivisionSummary(): ToolResult<ReturnType<typeof divisionSummary>> {
  const products = loadProducts(RAW_PRODUCTS);
  const summary = divisionSummary(products);
  if (summary.length === 0) return err('no_data', 'No SKU/division data available.');
  return ok(summary, 'SKU Performance · division totals');
}

// ---------------------------------------------------------------------------
// Command Center "what needs attention" — near-direct reuse of the same
// function the Overview page itself calls. Defaults match App.tsx's own
// defaults (actuals / month / Jul) so an unqualified question answers with
// exactly what a user landing on Command Center would see; a viewContext
// carrying a different scenario/granularity/period overrides that.
// ---------------------------------------------------------------------------
export interface AttentionQuery {
  scenario?: 'actuals' | 'gmTargetPlan' | 'efficiencyCase' | 'expansionCase';
  granularity?: 'month' | 'quarter' | 'ytd';
  month?: string;
  quarter?: string;
}

function resolveCell(query: AttentionQuery): { cell: PeriodCell; granularity: 'month' | 'quarter' | 'ytd'; month: string; quarter: string } | null {
  const scenarioKey = query.scenario ?? 'actuals';
  const granularity = query.granularity ?? 'month';
  const month = query.month ?? 'Jul';
  const quarter = query.quarter ?? 'Q4';
  const sd = scenariosFile.scenarios[scenarioKey];
  if (!sd) return null;
  const cell = granularity === 'ytd' ? sd.ytd : granularity === 'quarter' ? sd.quarters[quarter] : sd.months[month];
  if (!cell) return null;
  return { cell, granularity, month, quarter };
}

export function getManagementAttentionItems(query: AttentionQuery = {}): ToolResult<AttentionItem[]> {
  const resolved = resolveCell(query);
  if (!resolved) return err('no_data', 'No Command Center data for that period.');
  const items = computeAttentionItems(resolved.cell.kpis, resolved.granularity, resolved.month, resolved.quarter);
  const label = query.scenario ?? 'actuals';
  return ok(items, `Command Center Overview · ${label} · ${resolved.granularity === 'month' ? resolved.month : resolved.granularity === 'quarter' ? resolved.quarter : 'YTD'}`);
}

export function getWastagePct(query: AttentionQuery = {}): ToolResult<{ wastagePct: number; wastageCostAed: number }> {
  const resolved = resolveCell(query);
  if (!resolved) return err('no_data', 'No Command Center data for that period.');
  return ok(
    { wastagePct: wastagePctFromKpis(resolved.cell.kpis), wastageCostAed: resolved.cell.kpis.wastageCost.value },
    `Command Center Overview · wastage · ${resolved.granularity === 'month' ? resolved.month : resolved.granularity === 'quarter' ? resolved.quarter : 'YTD'}`,
  );
}

// ---------------------------------------------------------------------------
// B2B ranking — "highest delivery commitment", "highest collection exposure".
// Neither phrase is a literal field on B2BClient, so the mapping is made
// explicit here rather than left implicit: delivery commitment → total
// delivery volume (totalDeliveries), collection exposure → amount currently
// outstanding (receivableAmount). Both are real fields already shown on the
// B2B page (Account Profitability / Receivables), never invented.
// ---------------------------------------------------------------------------
export type B2BRankMetric = 'deliveryCommitment' | 'collectionExposure' | 'revenue' | 'margin';

export function getB2BClientRanking(metric: B2BRankMetric, limit = 5): ToolResult<{ name: string; value: number; unit: string }[]> {
  const clients = scenariosFile.b2b.clients;
  if (clients.length === 0) return err('no_data', 'No B2B client data available.');

  const keyed =
    metric === 'deliveryCommitment'
      ? clients.map((c) => ({ name: c.name, value: c.totalDeliveries, unit: 'deliveries' }))
      : metric === 'collectionExposure'
        ? clients.map((c) => ({ name: c.name, value: c.receivableAmount, unit: 'AED outstanding' }))
        : metric === 'revenue'
          ? clients.map((c) => ({ name: c.name, value: c.revenue, unit: 'AED revenue' }))
          : clients.map((c) => ({ name: c.name, value: c.marginPct, unit: '% margin' }));

  const ranked = [...keyed].sort((a, b) => b.value - a.value).slice(0, limit);
  return ok(ranked, `B2B Performance · ranked by ${metric === 'deliveryCommitment' ? 'total deliveries' : metric === 'collectionExposure' ? 'outstanding receivables' : metric}`);
}

export function getB2BSummary(): ToolResult<ReturnType<typeof deriveB2BSummary> & { receivables: ReturnType<typeof deriveReceivables> }> {
  const clients = scenariosFile.b2b.clients;
  if (clients.length === 0) return err('no_data', 'No B2B client data available.');
  return ok({ ...deriveB2BSummary(clients), receivables: deriveReceivables(clients) }, 'B2B Performance · company-wide summary');
}

// ---------------------------------------------------------------------------
// Convenience re-export so the route layer has one place to import
// requireRole/requireAuth from alongside the tools themselves.
// ---------------------------------------------------------------------------
export { requireRole };
export type { EmployeeSession, Response };
