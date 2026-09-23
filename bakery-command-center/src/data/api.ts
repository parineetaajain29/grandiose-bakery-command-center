import { useCallback, useEffect, useState } from 'react';
import type { LabourResult } from '../lib/labourCalc';
import type {
  Alert,
  AuditEvent,
  AuthUser,
  CauseBreakdown,
  ComparativeMetrics,
  DailyLog,
  DataQualityIssue,
  DepartmentAggregationComparison,
  DepartmentsMetrics,
  Employee,
  Feedback,
  Goal,
  GoalStatus,
  LegacyCheck,
  TrendPointWithProvenance,
  WorkforceOverview,
} from './types';

export type FetchState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error ?? `GET ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function sendJson<T = void>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const err = new Error(payload?.error ?? `${method} ${path} failed: ${res.status} ${res.statusText}`) as Error & {
      reason?: string;
      retryAfterSeconds?: number;
    };
    err.reason = payload?.reason;
    err.retryAfterSeconds = payload?.retryAfterSeconds;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

async function sendForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(path, { method: 'POST', body: form });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const err = new Error(payload?.error ?? `POST ${path} failed: ${res.status} ${res.statusText}`) as Error & { reason?: string };
    err.reason = payload?.reason;
    throw err;
  }
  return res.json();
}

function query(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) usp.set(key, value);
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

/** Generic loading/error/ready wrapper for any GET — every workspace screen is built on this one hook. */
export function useApiData<T>(fetcher: () => Promise<T>, deps: unknown[]): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetcher()
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
    // fetcher is recreated every render by design — callers pass their own dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

// --- Auth (PIN-based individual login, roles enforced server-side) -------

export function login(employeeId: string, pin: string): Promise<AuthUser> {
  return sendJson<AuthUser>('POST', '/api/auth/login', { employeeId, pin });
}

export async function logout(): Promise<void> {
  await sendJson('POST', '/api/auth/logout');
}

export async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch('/api/auth/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /api/auth/me failed: ${res.status} ${res.statusText}`);
  return res.json();
}

export type AuthState = { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; user: AuthUser };

export function useAuth(): { auth: AuthState; doLogin: (employeeId: string, pin: string) => Promise<void>; doLogout: () => Promise<void> } {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    fetchMe()
      .then((user) => setAuth(user ? { status: 'authenticated', user } : { status: 'anonymous' }))
      .catch(() => setAuth({ status: 'anonymous' }));
  }, []);

  const doLogin = useCallback(async (employeeId: string, pin: string) => {
    const user = await login(employeeId, pin);
    setAuth({ status: 'authenticated', user });
  }, []);

  const doLogout = useCallback(async () => {
    await logout();
    setAuth({ status: 'anonymous' });
  }, []);

  return { auth, doLogin, doLogout };
}

// --- Employees / departments ----------------------------------------------

export function getEmployees(): Promise<Employee[]> {
  return getJson('/api/employees');
}

export function getEmployee(id: string): Promise<Employee> {
  return getJson(`/api/employees/${id}`);
}

export interface DepartmentMetaRow {
  name: string;
  type: 'production' | 'support';
  allocationWeight?: number;
  allocationBasisNote?: string;
}

export function getDepartments(): Promise<DepartmentMetaRow[]> {
  return getJson('/api/departments');
}

// --- Daily logs -------------------------------------------------------------

export interface DailyLogWriteInput {
  employeeId?: string;
  date: string;
  shift: string;
  paidMinutes: number;
  breakMinutes: number;
  changeoverMinutes: number;
  downtimeMinutes: number;
  idleMinutes: number;
  activityType: string;
  unitsProduced?: number | null;
  downtimeCauseCode?: string | null;
  changeoverCauseCode?: string | null;
  notes?: string | null;
  lossReason?: string | null;
  dailySalaryCost?: number | null;
  revenueAttributed?: number | null;
}

export function getDailyLogs(params: { employeeId?: string; from?: string; to?: string } = {}): Promise<DailyLog[]> {
  return getJson(`/api/daily-logs${query(params)}`);
}

export function saveDailyLog(input: DailyLogWriteInput): Promise<DailyLog> {
  return sendJson('POST', '/api/daily-logs', input);
}

export function updateDailyLog(id: number, input: DailyLogWriteInput): Promise<DailyLog> {
  return sendJson('PUT', `/api/daily-logs/${id}`, input);
}

// --- Metrics ----------------------------------------------------------------

export function getEmployeeMetrics(id: string, from: string, to: string): Promise<LabourResult> {
  return getJson(`/api/metrics/employee/${id}${query({ from, to })}`);
}

/** Whether this employee has any daily log in range that predates idle-minutes tracking — see TrendPointWithProvenance. */
export function getEmployeeLegacyCheck(id: string, from: string, to: string): Promise<LegacyCheck> {
  return getJson(`/api/metrics/employee/${id}/legacy-check${query({ from, to })}`);
}

export function getDepartmentMetrics(name: string, from: string, to: string): Promise<LabourResult> {
  return getJson(`/api/metrics/department/${encodeURIComponent(name)}${query({ from, to })}`);
}

export function getBakeryMetrics(from: string, to: string): Promise<LabourResult> {
  return getJson(`/api/metrics/bakery${query({ from, to })}`);
}

export function getEmployeeTrend(id: string, from: string, to: string): Promise<TrendPointWithProvenance[]> {
  return getJson(`/api/metrics/trend/employee/${id}${query({ from, to })}`);
}

export function getDepartmentTrend(name: string, from: string, to: string): Promise<TrendPointWithProvenance[]> {
  return getJson(`/api/metrics/trend/department/${encodeURIComponent(name)}${query({ from, to })}`);
}

export function getBakeryTrend(from: string, to: string): Promise<TrendPointWithProvenance[]> {
  return getJson(`/api/metrics/trend/bakery${query({ from, to })}`);
}

export function getComparativeMetrics(employeeId: string, from: string, to: string): Promise<ComparativeMetrics> {
  return getJson(`/api/metrics/comparative/${employeeId}${query({ from, to })}`);
}

export function getDepartmentAggregationComparison(name: string, from: string, to: string): Promise<DepartmentAggregationComparison> {
  return getJson(`/api/metrics/aggregation-comparison/${encodeURIComponent(name)}${query({ from, to })}`);
}

export function getWorkforceOverview(from: string, to: string): Promise<WorkforceOverview> {
  return getJson(`/api/metrics/workforce-overview${query({ from, to })}`);
}

/** Scoped to the caller server-side: every department for manager/hr_admin, just their own for supervisor. */
export function getDepartmentsMetrics(from: string, to: string): Promise<DepartmentsMetrics> {
  return getJson(`/api/metrics/departments${query({ from, to })}`);
}

/** Downtime/changeover minutes and count by cause, per department — same scoping as getDepartmentsMetrics. */
export function getCauseBreakdown(from: string, to: string): Promise<CauseBreakdown> {
  return getJson(`/api/metrics/cause-breakdown${query({ from, to })}`);
}

// --- Goals --------------------------------------------------------------

export interface GoalWriteInput {
  employeeId: string;
  title: string;
  metric?: string | null;
  baseline?: number | null;
  target?: number | null;
  deadline?: string | null;
  notes?: string | null;
}

export function getGoals(employeeId?: string): Promise<Goal[]> {
  return getJson(`/api/goals${query({ employeeId })}`);
}

export function saveGoal(input: GoalWriteInput): Promise<Goal> {
  return sendJson('POST', '/api/goals', input);
}

export function updateGoalStatus(id: number, status: GoalStatus): Promise<Goal> {
  return sendJson('PUT', `/api/goals/${id}/status`, { status });
}

// --- Feedback -----------------------------------------------------------

export interface FeedbackWriteInput {
  employeeId: string;
  category: string;
  assessment?: string | null;
  comment: string;
  followUpDate?: string | null;
}

export function getFeedback(employeeId?: string): Promise<Feedback[]> {
  return getJson(`/api/feedback${query({ employeeId })}`);
}

export function saveFeedback(input: FeedbackWriteInput): Promise<Feedback> {
  return sendJson('POST', '/api/feedback', input);
}

export function acknowledgeFeedback(id: number, response: string | null): Promise<Feedback> {
  return sendJson('POST', `/api/feedback/${id}/acknowledge`, { response });
}

// --- Audit / alerts / data quality ---------------------------------------

export function getAuditLogs(): Promise<AuditEvent[]> {
  return getJson('/api/audit-log');
}

export function getAlerts(from: string, to: string): Promise<Alert[]> {
  return getJson(`/api/alerts${query({ from, to })}`);
}

export function getDataQuality(from: string, to: string): Promise<DataQualityIssue[]> {
  return getJson(`/api/data-quality${query({ from, to })}`);
}

// --- HR/Admin -------------------------------------------------------------

export function adminActivate(employeeId: string): Promise<Employee> {
  return sendJson('POST', `/api/admin/employees/${employeeId}/activate`);
}

export function adminDeactivate(employeeId: string): Promise<Employee> {
  return sendJson('POST', `/api/admin/employees/${employeeId}/deactivate`);
}

export function adminResetPin(employeeId: string): Promise<{ employeeId: string; newPin: string }> {
  return sendJson('POST', `/api/admin/employees/${employeeId}/reset-pin`);
}

// --- Settings (write-only credential storage — manager/hr_admin only) ------

export interface SettingsStatus {
  anthropicConfigured: boolean;
  emailConfigured: boolean;
  // Optional only so Data Processor's existing (Phase 7) fallback object
  // literal — { anthropicConfigured: false, emailConfigured: false } —
  // stays valid without editing that file. getSettingsStatus() server-side
  // always populates both; nothing here can actually be missing at runtime,
  // so don't add defensive undefined-handling for these on the Settings page.
  openAiConfigured?: boolean;
  aiRiskMonthlyCap?: number;
}

export function getSettingsStatus(): Promise<SettingsStatus> {
  return getJson('/api/settings/status');
}

export function saveAnthropicKey(apiKey: string): Promise<void> {
  return sendJson('POST', '/api/settings/anthropic-key', { apiKey });
}

export function clearAnthropicKey(): Promise<void> {
  return sendJson('DELETE', '/api/settings/anthropic-key');
}

export interface EmailCredentialsInput {
  emailAddress: string;
  appPassword: string;
  smtpServer: string;
  smtpPort: number;
}

export function saveEmailCredentials(input: EmailCredentialsInput): Promise<void> {
  return sendJson('POST', '/api/settings/email', input);
}

export function clearEmailCredentials(): Promise<void> {
  return sendJson('DELETE', '/api/settings/email');
}

export function saveOpenAiKey(apiKey: string): Promise<void> {
  return sendJson('POST', '/api/settings/openai-key', { apiKey });
}

export function clearOpenAiKey(): Promise<void> {
  return sendJson('DELETE', '/api/settings/openai-key');
}

export function saveAiRiskMonthlyCap(monthlyCap: number): Promise<void> {
  return sendJson('POST', '/api/settings/ai-risk-cap', { monthlyCap });
}

// --- Data Processor (upload -> AI-interpret -> confirm -> export/email) ---

export interface InterpretedSheet {
  sheet_name: string;
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
  insights: string[];
}

export interface InterpretationResult {
  detected_data_type: string;
  summary: string;
  sheets: InterpretedSheet[];
}

export interface DataProcessorUpload {
  id: number;
  filename: string;
  fileType: string;
  uploadedByEmployeeId: string;
  uploadedAt: string;
  status: 'interpreted' | 'confirmed';
  confirmedAt: string | null;
  detectedDataType: string | null;
  summary: string | null;
  result: InterpretationResult | null;
}

export function getDataProcessorStatus(): Promise<SettingsStatus> {
  return getJson('/api/data-processor/status');
}

export function listDataProcessorUploads(): Promise<DataProcessorUpload[]> {
  return getJson('/api/data-processor/uploads');
}

/** Throws with a `.reason` of 'not_configured' | 'error' when the upload fails to interpret — the caller shows that reason inline, never a raw stack. */
export function uploadFilesForInterpretation(files: File[]): Promise<DataProcessorUpload> {
  const form = new FormData();
  for (const file of files) form.append('files', file);
  return sendForm('/api/data-processor/upload', form);
}

export function confirmDataProcessorUpload(id: number): Promise<DataProcessorUpload> {
  return sendJson('POST', `/api/data-processor/${id}/confirm`);
}

export function getDataProcessorExportUrl(id: number): string {
  return `/api/data-processor/${id}/export`;
}

export function emailDataProcessorReport(id: number, to: string): Promise<void> {
  return sendJson('POST', `/api/data-processor/${id}/email`, { to });
}

// --- Optimization Lab (production-mix optimizer, server/services/optimization.ts) ---
// The app has no real Grandiose per-SKU cost/resource-consumption data (see
// skuData.ts's own comment), so the demo-dataset mode always runs the Python
// engine's illustrative 5-SKU dataset. A custom-data mode also exists
// (OptimizationLabPage.tsx) for a user's own numbers — `isDemoData` on the
// result is the authoritative signal for which one actually ran; branch UI
// on that, never on which mode was selected client-side.

export interface OptimizationSkuInput {
  sku: string;
  selling_price: number;
  variable_cost: number;
  current_production: number;
  forecast_demand: number;
  retail_minimum: number;
  b2b_commitment: number;
  labour_minutes: number;
  oven_minutes: number;
  flour_kg: number;
  butter_kg: number;
}

export type OptimizationResourceLimits = Record<OptimizationResourceName, number>;

export interface OptimizationSkuChange {
  sku: string;
  current_production: number;
  optimized_production: number;
  absolute_change: number;
  percentage_change: number | null;
  selling_price: number;
  variable_cost: number;
  contribution_margin_per_unit: number;
  forecast_demand: number;
  retail_minimum: number;
  b2b_commitment: number;
  effective_minimum: number;
}

export type OptimizationResourceName = 'labour_minutes' | 'oven_minutes' | 'flour_kg' | 'butter_kg';

export interface OptimizationResource {
  name: OptimizationResourceName;
  used: number;
  available: number;
  slack: number;
  utilization_percentage: number;
  binding: boolean;
}

export interface OptimizationOptimalResult {
  status: 'optimal';
  sku_changes: OptimizationSkuChange[];
  current_revenue: number;
  optimized_revenue: number;
  current_variable_cost: number;
  optimized_variable_cost: number;
  current_contribution: number;
  optimized_contribution: number;
  contribution_improvement: number;
  improvement_percentage: number | null;
  resources: OptimizationResource[];
  binding_constraints: OptimizationResourceName[];
  isDemoData: boolean;
}

export interface OptimizationInfeasibleResult {
  status: 'infeasible';
  message: string;
  minimum_resource_requirements: Record<OptimizationResourceName, number>;
  resource_availability: Record<OptimizationResourceName, number>;
  resource_shortfalls: Record<OptimizationResourceName, number>;
  isDemoData: boolean;
}

export type OptimizationResult = OptimizationOptimalResult | OptimizationInfeasibleResult;

export interface OptimizationCustomInput {
  sku_data: OptimizationSkuInput[];
  resource_limits: OptimizationResourceLimits;
}

/** Omit `input` to run the engine's own illustrative demo dataset (`isDemoData: true` on the result); pass one to run a user's own numbers instead (`isDemoData: false`). Throws on a 400 (invalid input, message from the engine's own validation) or 502 (engine process failure) — the caller shows `.message` inline. */
export function runOptimization(input?: OptimizationCustomInput): Promise<OptimizationResult> {
  return sendJson('POST', '/api/optimization/run', input ?? {});
}

// --- AI Risk Intelligence (Scenario & Resilience, 5th module) --------------

export type AiTimeHorizon = '7d' | '30d' | '90d' | '6mo' | '12mo';
export type AiRiskType = 'All' | 'Commodity' | 'Geopolitical' | 'Supply Chain' | 'Logistics' | 'Supplier' | 'Climate' | 'Regulatory' | 'FX';
export type AiRawMaterialFilter = 'All' | 'Wheat-Flour' | 'Butter-Dairy' | 'Sugar' | 'Cocoa' | 'Nuts' | 'Oils' | 'Eggs' | 'Yeast' | 'Packaging';
export type AiResearchDepth = 'quick' | 'standard' | 'detailed';
export type AiGeography = 'Global' | 'UAE' | 'GCC' | 'Europe' | 'Black Sea' | 'Asia';

export interface AiResearchParams {
  question: string;
  horizon: AiTimeHorizon;
  riskType: AiRiskType;
  rawMaterial: AiRawMaterialFilter;
  depth: AiResearchDepth;
  geography: AiGeography;
}

/** The only five assumption parameters this module ever proposes. Two (freight_premium_pct, safety_stock_days) have no backing scenarioCalc function — see ASSUMPTION_HAS_MODEL. */
export type AiAssumptionParam = 'raw_material_cost_increase_pct' | 'lead_time_extension_days' | 'freight_premium_pct' | 'stockout_probability' | 'safety_stock_days';

export const ASSUMPTION_HAS_MODEL: Record<AiAssumptionParam, boolean> = {
  raw_material_cost_increase_pct: true,
  lead_time_extension_days: true,
  freight_premium_pct: false,
  stockout_probability: true,
  safety_stock_days: false,
};

export interface AiSuggestedAssumption {
  parameter: AiAssumptionParam;
  suggestedValue: number;
  rationale: string;
}

export interface AiSuggestedSpendMixRow {
  origin: string;
  sharePct: number;
}

export interface AiActionPlan {
  now: string[];
  in30Days: string[];
  in90DaysPlus: string[];
}

export interface AiRiskResult {
  title: string;
  executiveSummary: string;
  whatIsHappening: string[];
  whyItMattersToGrandiose: string[];
  whatToWatch: string[];
  affectedMaterials: string[];
  horizon: string;
  confidence: 'low' | 'moderate' | 'high';
  overallRisk: 'low' | 'moderate' | 'high';
  suggestedAssumptions: AiSuggestedAssumption[];
  suggestedSpendMix?: AiSuggestedSpendMixRow[];
  actionPlan: AiActionPlan;
}

export interface AiCitedSource {
  title: string;
  url: string;
}

export interface AiResearchRecord {
  id: number;
  question: string;
  params: AiResearchParams;
  result: AiRiskResult;
  citedSources: AiCitedSource[];
  allSources: string[];
  sourcesRetrieved: boolean;
  userAssumptions: AiSuggestedAssumption[] | null;
  createdByEmployeeId: string;
  createdAt: string;
}

export interface AiWatchlistItem {
  id: number;
  risk: string;
  rawMaterial: string | null;
  geography: string | null;
  riskLevel: 'low' | 'moderate' | 'high';
  keyIndicator: string | null;
  lastResearchedAt: string | null;
  reviewDate: string | null;
  createdByEmployeeId: string;
  createdAt: string;
}

export interface AiWatchlistInput {
  risk: string;
  rawMaterial?: string | null;
  geography?: string | null;
  riskLevel: 'low' | 'moderate' | 'high';
  keyIndicator?: string | null;
  reviewDate?: string | null;
}

export interface AiUsageStats {
  usedThisMonth: number;
  monthlyCap: number;
  topUsers: { employeeId: string; count: number }[];
}

export function getAiRiskStatus(): Promise<{ configured: boolean }> {
  return getJson('/api/ai-risk/status');
}

/** Throws with `.reason` of 'not_configured' | 'monthly_cap' | 'rate_limit' | 'error' on failure — the caller shows that reason inline. */
export function runAiResearch(params: AiResearchParams, forceRefresh: boolean): Promise<{ research: AiResearchRecord; cached: boolean }> {
  return sendJson('POST', '/api/ai-risk/research', { ...params, forceRefresh });
}

export function listAiResearch(): Promise<AiResearchRecord[]> {
  return getJson('/api/ai-risk/research');
}

export function getAiResearch(id: number): Promise<AiResearchRecord> {
  return getJson(`/api/ai-risk/research/${id}`);
}

export function saveAiResearchAssumptions(id: number, assumptions: AiSuggestedAssumption[]): Promise<AiResearchRecord> {
  return sendJson('PUT', `/api/ai-risk/research/${id}/assumptions`, { assumptions });
}

export function listAiWatchlist(): Promise<AiWatchlistItem[]> {
  return getJson('/api/ai-risk/watchlist');
}

export function addAiWatchlistItem(input: AiWatchlistInput): Promise<AiWatchlistItem> {
  return sendJson('POST', '/api/ai-risk/watchlist', input);
}

export function updateAiWatchlistItem(id: number, patch: Partial<AiWatchlistInput>): Promise<AiWatchlistItem> {
  return sendJson('PUT', `/api/ai-risk/watchlist/${id}`, patch);
}

export function deleteAiWatchlistItem(id: number): Promise<void> {
  return sendJson('DELETE', `/api/ai-risk/watchlist/${id}`);
}

export function getAiUsageStats(): Promise<AiUsageStats> {
  return getJson('/api/ai-risk/usage');
}

// --- Export (server/services/export.ts) — Word/PDF for narrative content, ---
// CSV/Excel for tabular data. Every export sends data the caller already has
// (already rendered on screen) — the server only formats it, never recomputes.

export interface DocSection {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface DocSpec {
  title: string;
  subtitle?: string;
  sections: DocSection[];
}

export interface TableSheet {
  name: string;
  columns: string[];
  rows: (string | number)[][];
}

async function downloadBlob(path: string, body: unknown, filename: string): Promise<void> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error ?? `POST ${path} failed: ${res.status} ${res.statusText}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportDocx(spec: DocSpec): Promise<void> {
  return downloadBlob('/api/export/docx', spec, `${spec.title}.docx`);
}

export function exportPdf(spec: DocSpec): Promise<void> {
  return downloadBlob('/api/export/pdf', spec, `${spec.title}.pdf`);
}

export function exportCsv(sheet: TableSheet): Promise<void> {
  return downloadBlob('/api/export/csv', sheet, `${sheet.name}.csv`);
}

export function exportXlsx(sheets: TableSheet[]): Promise<void> {
  return downloadBlob('/api/export/xlsx', { sheets }, `${sheets[0]?.name ?? 'export'}.xlsx`);
}
