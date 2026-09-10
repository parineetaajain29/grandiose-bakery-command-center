import type { LabourResult } from '../lib/labourCalc';

export interface KpiValue {
  value: number;
  delta?: number;
  unit?: string;
}

export interface Kpis {
  revenue: KpiValue;
  grossMargin: KpiValue;
  wastageCost: KpiValue;
  capacityUtilization: KpiValue;
  workingCapital: KpiValue;
}

export interface SankeyFlow {
  name: string;
  value: number;
}

export interface SankeyData {
  revenue: SankeyFlow[];
  costOfProduction: SankeyFlow[];
  opex: SankeyFlow[];
}

export interface VarianceStep {
  label: string;
  value: number;
}

export interface VarianceData {
  budget: number;
  steps: VarianceStep[];
  actual: number;
}

export interface PeriodCell {
  subtitle: string;
  kpis: Kpis;
  sankey?: SankeyData;
  variance?: VarianceData;
}

export interface ScenarioData {
  label: string;
  months: Record<string, PeriodCell>;
  quarters: Record<string, PeriodCell>;
  ytd: PeriodCell;
}

export interface ModelScenarioLevers {
  incrementalHiring: number;
  wastageReductionTarget: number;
}

export interface ModelScenarioData {
  label: string;
  default: ModelScenarioLevers & {
    months: Record<string, PeriodCell>;
  };
}

export type ScenarioKey = 'actuals' | 'gmTargetPlan' | 'efficiencyCase' | 'expansionCase' | 'modelScenario';

export type PeriodGranularity = 'month' | 'quarter' | 'ytd';

export interface SupplierRow {
  name: string;
  category: string;
  sourcing: 'Dual-sourced' | 'Single-sourced';
  leadTimeDays: number;
  spendAED: number;
  risk: 'Low' | 'Watch' | 'High';
}

export interface SupplierRisk {
  summary: { vendorCount: number; onNinetyDayTerms: number; safetyStockMonths: number };
  categoryBar: { category: string; value: number; status: string }[];
  suppliers: SupplierRow[];
}

export interface Forecast13Week {
  note: string;
  baseline: number[];
  sliderRange: { min: number; max: number; step: number; unit: string };
  readoutTemplate: string;
}

/** Raw employee labour record — feeds src/lib/labourCalc.ts's computeLabourChain. */
export interface EmployeeRecord {
  id: string;
  name: string;
  department: string;
  shift: string;
  daysWorked: number;
  changeoverHours: number;
  machineDowntimeHours: number;
  idleWaitingHours: number;
  totalSalaryCost: number;
  /** Direct output value (production depts) or an allocated share of divisionRevenue (support depts) — brief §A4. */
  revenueAttributed: number;
}

export interface DepartmentMeta {
  name: string;
  type: 'production' | 'support';
  /** Support departments only: revenueAttributed total = divisionRevenue × allocationWeight. */
  allocationWeight?: number;
  allocationBasisNote?: string;
}

/** Shape of scenarios.json's employeePortal block — used only as the seed source for server/seed.ts now. */
export interface EmployeePortalData {
  _note: string;
  divisionRevenue: number;
  departments: DepartmentMeta[];
  employees: EmployeeRecord[];
}

// --- Employee portal: roles, daily logs, goals, feedback, audit ----------
// Role-based workforce management — every fetch is scoped server-side by role
// (src/data/api.ts calls the API; nothing here is trusted to filter on its own).

export type Role = 'employee' | 'supervisor' | 'manager' | 'hr_admin';

/** GET /api/auth/me and POST /api/auth/login response. */
export interface AuthUser {
  id: string;
  name: string;
  department: string;
  shift: string;
  role: Role;
  active: boolean;
}

export interface Employee {
  id: string;
  name: string;
  department: string;
  shift: string;
  role: Role;
  active: boolean;
}

/** One employee's logged figures for one shift on one day. */
export interface DailyLog {
  id: number;
  employeeId: string;
  date: string; // YYYY-MM-DD
  shift: string;
  paidMinutes: number;
  breakMinutes: number;
  changeoverMinutes: number;
  downtimeMinutes: number;
  idleMinutes: number;
  /** Server-derived, never client-set — see deriveProductiveMinutes in src/lib/labourCalc.ts. */
  productiveMinutes: number;
  activityType: string;
  unitsProduced: number | null;
  downtimeCauseCode: string | null;
  changeoverCauseCode: string | null;
  notes: string | null;
  lossReason: string | null;
  dailySalaryCost: number;
  revenueAttributed: number;
  createdByEmployeeId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CauseBreakdownEntry {
  cause: string;
  minutes: number;
  count: number;
}

export interface DepartmentCauseBreakdown {
  department: string;
  downtime: CauseBreakdownEntry[];
  changeover: CauseBreakdownEntry[];
}

/** GET /api/metrics/cause-breakdown — supervisor/manager/hr_admin; scoped to the caller (own department for supervisor, all for manager/hr_admin). "Not recorded (before cause tracking)" groups pre-migration rows that have minutes but no stored cause. */
export type CauseBreakdown = DepartmentCauseBreakdown[];

export type GoalStatus = 'active' | 'completed' | 'overdue' | 'cancelled';

export interface Goal {
  id: number;
  employeeId: string;
  title: string;
  metric: string | null;
  baseline: number | null;
  target: number | null;
  deadline: string | null;
  notes: string | null;
  status: GoalStatus;
  createdByEmployeeId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Feedback {
  id: number;
  employeeId: string;
  category: string;
  assessment: string | null;
  comment: string;
  followUpDate: string | null;
  createdByEmployeeId: string;
  createdAt: string;
  acknowledgedAt: string | null;
  employeeResponse: string | null;
}

export interface AuditEvent {
  id: number;
  at: string;
  actorEmployeeId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  affectedEmployeeId: string | null;
  affectedName: string | null;
  details: string | null;
}

export interface Alert {
  type: 'missing_logs' | 'high_downtime' | 'goal_deadline';
  severity: 'info' | 'warning';
  employeeId: string | null;
  employeeName: string | null;
  message: string;
}

export interface DataQualityIssue {
  logId: number;
  employeeId: string;
  employeeName: string | null;
  date: string;
  issue: string;
}

/** GET /api/metrics/comparative/:employeeId — self vs. department vs. bakery, §5. */
export interface ComparativeMetrics {
  employee: LabourResult;
  department: LabourResult;
  bakery: LabourResult;
  departmentName: string;
}

/** GET /api/metrics/aggregation-comparison/:departmentName — the §12 correct-vs-naive-mean callout. */
export interface DepartmentAggregationComparison {
  correct: LabourResult;
  naiveMeanTrueEfficiencyPct: number | null;
  employeeCount: number;
}

/**
 * GET /api/metrics/trend/{employee,department,bakery}/... — one point per period plus a
 * provenance flag. hasLegacyData is true when the period includes a daily log saved
 * before idle-minutes tracking existed, whose productive minutes were self-reported
 * rather than derived. True Efficiency/Performance While Working are unaffected either
 * way — this only marks which points carry a weaker data-integrity guarantee.
 */
export interface TrendPointWithProvenance {
  period: string;
  result: LabourResult;
  hasLegacyData: boolean;
}

/** GET /api/metrics/employee/:id/legacy-check — whether the given range includes any pre-idle-tracking daily log for this employee. */
export interface LegacyCheck {
  hasLegacyData: boolean;
}

/** GET /api/metrics/workforce-overview — manager/hr_admin only. */
export interface WorkforceOverview {
  activeEmployeeCount: number;
  bakery: LabourResult;
  departments: { name: string; result: LabourResult }[];
}

export interface DepartmentMetricRow {
  name: string;
  result: LabourResult;
}

/** GET /api/metrics/departments — supervisor/manager/hr_admin; scoped to the caller (own department for supervisor, all for manager/hr_admin). */
export type DepartmentsMetrics = DepartmentMetricRow[];

// --- B2B (Feature B) ----------------------------------------------------

export interface B2BSummary {
  revenue: number;
  revenueDeltaPct: number;
  netMarginPct: number;
  retailMarginPct: number;
  otifPct: number;
  otifLateCount: number;
  collectionDays: number;
  supplierTermsDaysContext: number;
}

export interface B2BWeeklyTrendPoint {
  week: number;
  revenue: number;
  serviceCost: number;
}

export interface MarginalOrderInputs {
  orderValue: number;
  ingredientCost: number;
  packagingCost: number;
  deliveryCost: number;
  incrementalLabourCost: number;
  overtimePremium: number;
}

export interface B2BCapacity {
  retailPct: number;
  b2bPct: number;
  idlePct: number;
  ordersInOvertimeSlots: number;
  ordersNextWeek: number;
  marginalScenarios: {
    idleCapacityOrder: MarginalOrderInputs;
    overtimeOrder: MarginalOrderInputs;
  };
}

export interface B2BClient {
  name: string;
  location: string;
  frequency: string;
  revenue: number;
  serviceCost: number;
  marginPct: number;
  marginalMarginPct: number;
  otifPct: number;
  paymentTermsDays: number;
}

export interface B2BReceivables {
  total: number;
  past60: number;
  /** [0-30, 31-60, 61-90, 90+] days */
  buckets: [number, number, number, number];
}

export interface B2BDelivery {
  client: string;
  location: string;
  time: string;
  onTime: boolean;
  delayMinutes?: number;
  value: number;
}

export interface B2BData {
  _note: string;
  summary: B2BSummary;
  weeklyTrend: B2BWeeklyTrendPoint[];
  capacity: B2BCapacity;
  clients: B2BClient[];
  receivables: B2BReceivables;
  recentDeliveries: B2BDelivery[];
}

// --- Performance Tracker (Command Center) — ported from the Streamlit
// Performance Tracker page (app.py lines 490-503, 2050-2179). ------------

export interface PerformanceTrackerBaseline {
  foodCostPct: number;
  wastagePct: number;
  grossMarginPct: number;
  costPerUnit: number;
  standardCostPerUnit: number;
}

export interface PerformanceTrackerKpiCard {
  key: keyof PerformanceTrackerBaseline;
  label: string;
  /** Verbatim from the Streamlit source — a hardcoded caption, not independently computed from baseline/trend (see migration report for the one known inconsistency: food cost's "+1.2pt" doesn't equal baseline.foodCostPct - targetFoodCostPct = 1.4). */
  badge: string;
  tone: 'up-bad' | 'down-good' | 'flat';
}

export interface CostStructureBaseline {
  foodCostPct: number;
  labourTargetPct: number;
  packagingPct: number;
  overheadPct: number;
}

export interface CategoryPanel {
  title: string;
  metrics: { label: string; value: string }[];
}

/** New for this migration — not present in the Streamlit source. See scenarios.json's performanceTracker._note. */
export interface WastageByDivisionRow {
  division: string;
  wastagePct: number;
}

export interface PerformanceTrackerData {
  months: string[];
  foodCostTrend: number[];
  targetFoodCostPct: number;
  wastageTrend: number[];
  marginTrend: number[];
  costUnitTrend: number[];
  baseline: PerformanceTrackerBaseline;
  kpiCards: PerformanceTrackerKpiCard[];
  costStructure: CostStructureBaseline;
  categoryPanels: CategoryPanel[];
  wastageByDivision: WastageByDivisionRow[];
}

export interface ScenariosFile {
  _note: string;
  meta: {
    companyName: string;
    division: string;
    headcountCurrent: number;
    headcountTarget: number;
    shiftLength: number;
    wastageTarget: number;
  };
  scenarios: {
    actuals: ScenarioData;
    gmTargetPlan: ScenarioData;
    efficiencyCase: ScenarioData;
    expansionCase: ScenarioData;
    modelScenario: ModelScenarioData;
  };
  supplierRisk: SupplierRisk;
  employeePortal: EmployeePortalData;
  b2b: B2BData;
  forecast13Week: Forecast13Week;
  performanceTracker: PerformanceTrackerData;
}
