import { useState } from 'react';
import { ScenarioSubNav, type ScenarioSubTab } from './ScenarioSubNav';
import { InflationSensitivity } from './InflationSensitivity';
import { SupplyDisruptionRisk } from './SupplyDisruptionRisk';
import { PandemicPreparedness } from './PandemicPreparedness';
import { SupplierAlternatives } from './SupplierAlternatives';

/** Ported from the Streamlit Scenario & Resilience page (app.py lines 2186-2428) — four independent modules, tabbed exactly as the source's st.tabs. */
export function ScenarioResiliencePage() {
  const [tab, setTab] = useState<ScenarioSubTab>('1 · Inflation Sensitivity');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">SCENARIO &amp; RESILIENCE</p>
        <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">Forward-looking risk analysis</h2>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">
          Four independent what-if modules — none of these feed back into Command Center's KPIs; each is scoped to its
          own module, exactly as in the source.
        </p>
      </div>

      <ScenarioSubNav active={tab} onChange={setTab} />

      {tab === '1 · Inflation Sensitivity' && <InflationSensitivity />}
      {tab === '2 · Supply Disruption Risk' && <SupplyDisruptionRisk />}
      {tab === '3 · Pandemic Preparedness' && <PandemicPreparedness />}
      {tab === '4 · Supplier Alternatives' && <SupplierAlternatives />}
    </div>
  );
}
