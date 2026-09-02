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
  forecast13Week: Forecast13Week;
}
