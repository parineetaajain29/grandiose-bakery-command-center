import { useEffect, useMemo, useState } from 'react';
import { Header } from './components/Header';
import { ScenarioTabs } from './components/ScenarioTabs';
import { PeriodSelector } from './components/PeriodSelector';
import { KpiStrip } from './components/KpiStrip';
import { ModelScenarioLevers } from './components/ModelScenarioLevers';
import { SankeyMoneyFlow } from './components/SankeyMoneyFlow';
import { ForecastModule } from './components/ForecastModule';
import { SupplierRiskTable } from './components/SupplierRiskTable';
import { VarianceWaterfall } from './components/VarianceWaterfall';
import { EmployeePortalGate } from './components/employee/EmployeePortalGate';
import { B2BPage } from './components/b2b/B2BPage';
import { computeModelScenarioKpis, getSankeyForCell, scenariosFile } from './data';
import type { PeriodGranularity, ScenarioKey } from './data';

type AppPage = 'commandCenter' | 'employeePortal' | 'b2b';

const APP_PAGES: { key: AppPage; label: string }[] = [
  { key: 'commandCenter', label: 'Command Center' },
  { key: 'employeePortal', label: 'Employee Portal' },
  { key: 'b2b', label: 'B2B Performance' },
];

const MONTH_FULL: Record<string, string> = {
  Aug: 'August',
  Sep: 'September',
  Oct: 'October',
  Nov: 'November',
  Dec: 'December',
  Jan: 'January',
  Feb: 'February',
  Mar: 'March',
  Apr: 'April',
  May: 'May',
  Jun: 'June',
  Jul: 'July',
};

// Fiscal year FY2026 runs Aug 2025 -> Jul 2026 (books close July 2026 per brief §3.1).
const MONTH_YEAR: Record<string, number> = {
  Aug: 2025,
  Sep: 2025,
  Oct: 2025,
  Nov: 2025,
  Dec: 2025,
  Jan: 2026,
  Feb: 2026,
  Mar: 2026,
  Apr: 2026,
  May: 2026,
  Jun: 2026,
  Jul: 2026,
};

function getDateLabel(scenario: ScenarioKey, granularity: PeriodGranularity, month: string, quarter: string) {
  if (scenario === 'modelScenario') return 'Your custom what-if scenario';
  if (granularity === 'month') return `Close of ${MONTH_FULL[month] ?? month} ${MONTH_YEAR[month] ?? 2026}`;
  if (granularity === 'quarter') return `Close of ${quarter} FY2026`;
  return 'Close of FY2026 through July';
}

function App() {
  const [page, setPage] = useState<AppPage>('commandCenter');
  const [scenario, setScenario] = useState<ScenarioKey>('actuals');
  const [granularity, setGranularity] = useState<PeriodGranularity>('month');
  const [selectedMonth, setSelectedMonth] = useState('Jul');
  const [selectedQuarter, setSelectedQuarter] = useState('Q4');

  const modelDefault = scenariosFile.scenarios.modelScenario.default;
  const [modelHiring, setModelHiring] = useState(modelDefault.incrementalHiring);
  const [modelWastageTarget, setModelWastageTarget] = useState(modelDefault.wastageReductionTarget);

  const isModel = scenario === 'modelScenario';
  const scenarioData = isModel ? null : scenariosFile.scenarios[scenario];

  const availableMonths = useMemo(() => (scenarioData ? Object.keys(scenarioData.months) : ['Jul']), [scenarioData]);
  const availableQuarters = useMemo(() => (scenarioData ? Object.keys(scenarioData.quarters) : []), [scenarioData]);

  // Keep the period selection valid as scenarios (with different data coverage) are swapped.
  useEffect(() => {
    if (isModel) {
      setGranularity('month');
      return;
    }
    if (granularity === 'month' && !availableMonths.includes(selectedMonth)) {
      setSelectedMonth(availableMonths[availableMonths.length - 1] ?? 'Jul');
    }
    if (granularity === 'quarter' && !availableQuarters.includes(selectedQuarter)) {
      setSelectedQuarter(availableQuarters[0] ?? 'Q4');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario]);

  const cell = useMemo(() => {
    if (isModel) {
      return {
        subtitle: modelDefault.months.Jul.subtitle,
        kpis: computeModelScenarioKpis(modelHiring, modelWastageTarget),
      };
    }
    const sd = scenarioData!;
    if (granularity === 'ytd') return sd.ytd;
    if (granularity === 'quarter') return sd.quarters[selectedQuarter] ?? sd.quarters[availableQuarters[0]];
    return sd.months[selectedMonth] ?? sd.months[availableMonths[availableMonths.length - 1]];
  }, [isModel, modelDefault, modelHiring, modelWastageTarget, scenarioData, granularity, selectedMonth, selectedQuarter, availableMonths, availableQuarters]);

  const { sankey, isDerived } = getSankeyForCell(cell);
  const dateLabel = getDateLabel(scenario, granularity, selectedMonth, selectedQuarter);

  const varianceCell = !isModel && granularity === 'month' && selectedMonth === 'Jul' && scenario === 'actuals' ? scenariosFile.scenarios.actuals.months.Jul.variance : undefined;

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <Header subtitle={cell.subtitle} dateLabel={dateLabel} />

      <main className="mx-auto flex max-w-[1400px] flex-col gap-8 px-6 py-8 sm:px-10">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="App section">
          {APP_PAGES.map((p) => {
            const isActive = p.key === page;
            return (
              <button
                key={p.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setPage(p.key)}
                className={`rounded-full border px-4 py-2 font-mono text-xs tracking-wide transition-colors ${
                  isActive
                    ? 'border-accent-blue bg-accent-blue text-[#04070d]'
                    : 'border-border-subtle bg-bg-panel text-text-secondary hover:border-accent-blue/50 hover:text-text-primary'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {page === 'employeePortal' && <EmployeePortalGate />}
        {page === 'b2b' && <B2BPage />}

        {page === 'commandCenter' && (
          <>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <ScenarioTabs active={scenario} onChange={setScenario} />
              {!isModel && (
                <PeriodSelector
                  granularity={granularity}
                  onGranularityChange={setGranularity}
                  months={availableMonths}
                  quarters={availableQuarters}
                  selectedMonth={selectedMonth}
                  selectedQuarter={selectedQuarter}
                  onSelectMonth={setSelectedMonth}
                  onSelectQuarter={setSelectedQuarter}
                />
              )}
            </div>

            {isModel && (
              <ModelScenarioLevers
                hiring={modelHiring}
                onHiringChange={setModelHiring}
                wastageTargetPct={modelWastageTarget}
                onWastageTargetChange={setModelWastageTarget}
              />
            )}

            <KpiStrip kpis={cell.kpis} granularity={granularity} />

            <SankeyMoneyFlow sankeyData={sankey} isDerived={isDerived} />

            <ForecastModule />

            <SupplierRiskTable />

            {varianceCell ? (
              <VarianceWaterfall variance={varianceCell} />
            ) : (
              <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
                <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">BUDGET VS ACTUAL</p>
                <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">
                  Production cost variance
                </h2>
                <p className="mt-2 max-w-xl text-sm text-text-secondary">
                  Budget-vs-actual variance is only booked for closed actuals. Switch to{' '}
                  <strong className="text-text-primary">Actuals</strong> ·{' '}
                  <strong className="text-text-primary">Month</strong> · <strong className="text-text-primary">Jul</strong> to
                  view it.
                </p>
              </section>
            )}
          </>
        )}

        <footer className="border-t border-border-subtle pt-6 pb-4">
          <p className="font-mono text-[11px] text-text-secondary">
            Placeholder data — figures are realistic but fictional, for demo purposes only. Replace with real GM
            meeting / finance figures before external use.
          </p>
        </footer>
      </main>
    </div>
  );
}

export default App;
