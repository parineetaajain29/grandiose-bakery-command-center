import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './data/api';
import type { AuthUser } from './data';
import { LoginScreen } from './components/employee/LoginScreen';
import { Header } from './components/Header';
import { CommandCenterSubNav, type CommandCenterSubTab } from './components/CommandCenterSubNav';
import { PerformanceTracker } from './components/performanceTracker/PerformanceTracker';
import { ScenarioTabs } from './components/ScenarioTabs';
import { PeriodSelector } from './components/PeriodSelector';
import { KpiStrip } from './components/KpiStrip';
import { NeedsAttention } from './components/NeedsAttention';
import { ModelScenarioLevers } from './components/ModelScenarioLevers';
import { SankeyMoneyFlow } from './components/SankeyMoneyFlow';
import { ForecastModule } from './components/ForecastModule';
import { SupplierRiskTable } from './components/SupplierRiskTable';
import { VarianceWaterfall } from './components/VarianceWaterfall';
import { EmployeePortalGate } from './components/employee/EmployeePortalGate';
import { B2BPage } from './components/b2b/B2BPage';
import { ScenarioResiliencePage } from './components/scenario/ScenarioResiliencePage';
import { CompanyProfile } from './components/CompanyProfile';
import { SkuPerformancePage } from './components/sku/SkuPerformancePage';
import { DataProcessorPage } from './components/dataProcessor/DataProcessorPage';
import { SettingsPage } from './components/settings/SettingsPage';
import { computeModelScenarioKpis, getSankeyForCell, scenariosFile } from './data';
import type { AnalysisContext, PeriodGranularity, ScenarioKey } from './data';
import { computeAttentionItems, type AttentionItem } from './lib/commandCenterSignals';

type AppPage = 'commandCenter' | 'scenarios' | 'employeePortal' | 'companyProfile' | 'sku' | 'b2b' | 'dataProcessor' | 'settings';

const APP_PAGES: { key: AppPage; label: string }[] = [
  { key: 'commandCenter', label: 'Command Center' },
  { key: 'scenarios', label: 'Scenarios' },
  { key: 'employeePortal', label: 'Employee Portal' },
  { key: 'companyProfile', label: 'Company Profile' },
  { key: 'sku', label: 'SKU Performance' },
  { key: 'b2b', label: 'B2B Performance' },
  { key: 'dataProcessor', label: 'Data Processor' },
];

// Management utility, not a content page — kept visually apart from
// APP_PAGES rather than counted among the 7 content pages (see Phase 7 plan).
const SETTINGS_PAGE: { key: AppPage; label: string } = { key: 'settings', label: 'Settings' };

/**
 * The single source of truth for "who can see what" at the nav level. Server
 * routes enforce their own access independently (see rbac.ts and each
 * router) — this only decides which buttons render and which page a role
 * falls back to; it is not itself access control.
 */
function getAllowedPages(role: AuthUser['role']): AppPage[] {
  if (role === 'employee') return ['employeePortal'];
  const base: AppPage[] = ['commandCenter', 'scenarios', 'employeePortal', 'companyProfile', 'sku', 'b2b'];
  if (role === 'supervisor') return base;
  return [...base, 'dataProcessor']; // manager, hr_admin
}

function canSeeSettings(role: AuthUser['role']): boolean {
  return role === 'manager' || role === 'hr_admin';
}

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
  const { auth, doLogin, doLogout } = useAuth();
  const [page, setPage] = useState<AppPage>('commandCenter');
  const [ccTab, setCcTab] = useState<CommandCenterSubTab>('Overview');
  const [scenario, setScenario] = useState<ScenarioKey>('actuals');
  const [granularity, setGranularity] = useState<PeriodGranularity>('month');
  const [selectedMonth, setSelectedMonth] = useState('Jul');
  const [selectedQuarter, setSelectedQuarter] = useState('Q4');

  const modelDefault = scenariosFile.scenarios.modelScenario.default;
  const [modelHiring, setModelHiring] = useState(modelDefault.incrementalHiring);
  const [modelWastageTarget, setModelWastageTarget] = useState(modelDefault.wastageReductionTarget);

  // Command Center Overview -> Performance Tracker handoff. Carries a signal
  // identity only, never a specific figure — Overview's and Performance
  // Tracker's datasets are independently sourced and don't agree numerically
  // (see the product-flow audit), so this must never imply the destination
  // will confirm a number seen here. Persists until overwritten by a new
  // investigate click or dismissed on the destination side — not cleared
  // automatically on navigation, a deliberate minimal choice.
  const [analysisContext, setAnalysisContext] = useState<AnalysisContext | null>(null);

  // Quick What-If -> Scenario Analysis handoff. A different payload (lever
  // assumptions, not a signal identity) to a different, currently
  // non-consuming destination — kept separate from analysisContext rather
  // than folded into one "any handoff" type.
  const [scenarioHandoff, setScenarioHandoff] = useState<{ hiring: number; wastageTargetPct: number } | null>(null);

  // Performance Tracker -> SKU Performance handoff (Stage 4e's "Analyse
  // affected SKUs"). SKU Performance doesn't consume this yet — same
  // handoff-architecture-only treatment as scenarioHandoff.
  const [skuHandoff, setSkuHandoff] = useState<AnalysisContext | null>(null);

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

  const attentionItems = useMemo(
    () => computeAttentionItems(cell.kpis, granularity, selectedMonth, selectedQuarter),
    [cell.kpis, granularity, selectedMonth, selectedQuarter],
  );

  function goToPerformanceTracker(item: AttentionItem) {
    setAnalysisContext({ signal: item.signal, reason: item.reason, originPeriodLabel: dateLabel, originPage: 'overview' });
    setCcTab('Performance Tracker');
  }

  function openInScenarioAnalysis() {
    setScenarioHandoff({ hiring: modelHiring, wastageTargetPct: modelWastageTarget });
    setPage('scenarios');
  }

  function seeQuickWhatIfEffect() {
    setAnalysisContext({
      signal: 'wastage',
      reason: `Viewing effect of your Quick What-If adjustment: +${modelHiring} hires, ${modelWastageTarget.toFixed(1)}% wastage target.`,
      originPeriodLabel: dateLabel,
      originPage: 'overview',
    });
    setCcTab('Performance Tracker');
  }

  function goToSkuPerformance(context: AnalysisContext) {
    setSkuHandoff(context);
    setPage('sku');
  }

  const varianceCell = !isModel && granularity === 'month' && selectedMonth === 'Jul' && scenario === 'actuals' ? scenariosFile.scenarios.actuals.months.Jul.variance : undefined;

  if (auth.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary text-text-primary">
        <p className="font-mono text-sm text-text-secondary">Checking login…</p>
      </div>
    );
  }

  if (auth.status === 'anonymous') {
    return (
      <div className="min-h-screen bg-bg-primary text-text-primary">
        <LoginScreen onLogin={doLogin} />
      </div>
    );
  }

  const { user } = auth;
  const allowedPages = getAllowedPages(user.role);
  const showSettings = canSeeSettings(user.role);
  // getAllowedPages() deliberately never includes 'settings' — it's tracked
  // via the separate showSettings boolean below, not folded into the content
  // page list. displayPage's validity check has to account for both, or
  // 'settings' always fails allowedPages.includes() and silently falls back
  // to allowedPages[0] regardless of role.
  const validPages: AppPage[] = showSettings ? [...allowedPages, SETTINGS_PAGE.key] : allowedPages;
  const displayPage = validPages.includes(page) ? page : allowedPages[0];
  const visiblePages = APP_PAGES.filter((p) => allowedPages.includes(p.key));

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <Header subtitle={cell.subtitle} dateLabel={dateLabel} user={user} onLogout={doLogout} />

      <main className="mx-auto flex max-w-[1400px] flex-col gap-8 px-6 py-8 sm:px-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="App section">
            {visiblePages.map((p) => {
              const isActive = p.key === displayPage;
              return (
                <button
                  key={p.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setPage(p.key)}
                  className={`rounded-full border px-4 py-2 font-sans text-xs font-medium transition-colors ${
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
          {showSettings && (
            <button
              type="button"
              role="tab"
              aria-selected={displayPage === SETTINGS_PAGE.key}
              onClick={() => setPage(SETTINGS_PAGE.key)}
              className={`rounded-full border px-4 py-2 font-sans text-xs font-medium transition-colors ${
                displayPage === SETTINGS_PAGE.key
                  ? 'border-accent-blue bg-accent-blue text-[#04070d]'
                  : 'border-border-subtle bg-bg-panel text-text-secondary hover:border-accent-blue/50 hover:text-text-primary'
              }`}
            >
              {SETTINGS_PAGE.label}
            </button>
          )}
        </div>

        {displayPage === 'employeePortal' && <EmployeePortalGate user={user} />}
        {displayPage === 'b2b' && <B2BPage />}
        {displayPage === 'scenarios' && (
          <>
            {scenarioHandoff && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-accent-blue/30 bg-accent-blue/10 px-4 py-3">
                <p className="font-sans text-xs text-text-primary">
                  Carried over from Quick What-If: +{scenarioHandoff.hiring} hires, {scenarioHandoff.wastageTargetPct.toFixed(1)}%
                  wastage target — not yet applied to Scenario Analysis.
                </p>
                <button
                  type="button"
                  onClick={() => setScenarioHandoff(null)}
                  className="shrink-0 font-sans text-xs font-medium text-accent-blue hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}
            <ScenarioResiliencePage role={user.role} />
          </>
        )}
        {displayPage === 'companyProfile' && <CompanyProfile />}
        {displayPage === 'sku' && (
          <>
            {skuHandoff && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-accent-blue/30 bg-accent-blue/10 px-4 py-3">
                <p className="font-sans text-xs text-text-primary">
                  Carried over from Performance Tracker: investigating {skuHandoff.signal}
                  {skuHandoff.division ? ` — ${skuHandoff.division}` : ''} — not yet applied as a filter on this page.
                </p>
                <button
                  type="button"
                  onClick={() => setSkuHandoff(null)}
                  className="shrink-0 font-sans text-xs font-medium text-accent-blue hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}
            <SkuPerformancePage />
          </>
        )}
        {displayPage === 'dataProcessor' && <DataProcessorPage user={user} />}
        {displayPage === 'settings' && <SettingsPage user={user} />}

        {displayPage === 'commandCenter' && (
          <>
            <CommandCenterSubNav active={ccTab} onChange={setCcTab} />

            {ccTab === 'Overview' && (
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
                    onContinueAnalysis={openInScenarioAnalysis}
                    onSeeEffect={seeQuickWhatIfEffect}
                  />
                )}

                <KpiStrip kpis={cell.kpis} granularity={granularity} attentionItems={attentionItems} onInvestigate={goToPerformanceTracker} />

                <NeedsAttention items={attentionItems} onInvestigate={goToPerformanceTracker} />

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

            {ccTab === 'Performance Tracker' && (
              <PerformanceTracker
                kpis={cell.kpis}
                context={analysisContext}
                onClearContext={() => setAnalysisContext(null)}
                onAnalyzeSkus={goToSkuPerformance}
              />
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
