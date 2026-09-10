import { useCallback, useEffect, useState } from 'react';
import type { LabourResult, TrendPoint } from '../lib/labourCalc';
import type {
  Alert,
  AuditEvent,
  AuthUser,
  ComparativeMetrics,
  DailyLog,
  DataQualityIssue,
  DepartmentAggregationComparison,
  DepartmentsMetrics,
  Employee,
  Feedback,
  Goal,
  GoalStatus,
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

async function sendJson<T = void>(method: 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error ?? `${method} ${path} failed: ${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
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
  productiveMinutes: number;
  unitsProduced?: number | null;
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

export function getDepartmentMetrics(name: string, from: string, to: string): Promise<LabourResult> {
  return getJson(`/api/metrics/department/${encodeURIComponent(name)}${query({ from, to })}`);
}

export function getBakeryMetrics(from: string, to: string): Promise<LabourResult> {
  return getJson(`/api/metrics/bakery${query({ from, to })}`);
}

export function getEmployeeTrend(id: string, from: string, to: string): Promise<TrendPoint[]> {
  return getJson(`/api/metrics/trend/employee/${id}${query({ from, to })}`);
}

export function getDepartmentTrend(name: string, from: string, to: string): Promise<TrendPoint[]> {
  return getJson(`/api/metrics/trend/department/${encodeURIComponent(name)}${query({ from, to })}`);
}

export function getBakeryTrend(from: string, to: string): Promise<TrendPoint[]> {
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
