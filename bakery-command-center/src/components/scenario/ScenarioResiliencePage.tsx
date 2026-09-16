import { useState } from 'react';
import type { AuthUser } from '../../data';
import { ScenarioSubNav, type ScenarioSubTab } from './ScenarioSubNav';
import { InflationSensitivity } from './InflationSensitivity';
import { SupplyDisruptionRisk } from './SupplyDisruptionRisk';
import { PandemicPreparedness } from './PandemicPreparedness';
import { SupplierAlternatives } from './SupplierAlternatives';
import { AiRiskIntelligence } from './aiRisk/AiRiskIntelligence';

interface ScenarioResiliencePageProps {
  role: AuthUser['role'];
}

/**
 * Ported from the Streamlit Scenario & Resilience page (app.py lines 2186-2428)
 * — four independent modules, tabbed exactly as the source's st.tabs, reachable
 * by anyone who can reach this page at all (the login wall lives once, at the
 * top of App.tsx). The 5th module (AI Risk Intelligence, not a Streamlit port)
 * is manager/hr_admin only: `role` arrives as a prop from that single top-level
 * auth check, not from a second useAuth() call here — it exists solely to
 * decide whether tab 5's button appears; modules 1-4 never consult it.
 */
export function ScenarioResiliencePage({ role }: ScenarioResiliencePageProps) {
  const [tab, setTab] = useState<ScenarioSubTab>('1 · Inflation Sensitivity');
  const canAccessAiRisk = role === 'manager' || role === 'hr_admin';

  // Guards against a stale tab selection (e.g. a session that loses
  // manager/hr_admin standing mid-visit) — the button being hidden isn't
  // enough on its own if `tab` state already points at it. Derived at render
  // time rather than synced back into `tab` via an effect: if access is later
  // restored, the real `tab` state still says '5' and resumes there, which is
  // the more forgiving behavior for what should be a rare, transient case.
  const displayTab = tab === '5 · AI Risk Intelligence' && !canAccessAiRisk ? '1 · Inflation Sensitivity' : tab;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-sans text-xs font-semibold uppercase tracking-wide text-accent-blue">Scenario &amp; Resilience</p>
        <h2 className="mt-1.5 font-sans text-xl font-bold tracking-tight text-text-primary sm:text-2xl">Forward-looking risk analysis</h2>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">
          Four independent what-if modules — none of these feed back into Command Center's KPIs; each is scoped to its
          own module, exactly as in the source.
        </p>
      </div>

      <ScenarioSubNav active={displayTab} onChange={setTab} showAiRisk={canAccessAiRisk} />

      {displayTab === '1 · Inflation Sensitivity' && <InflationSensitivity />}
      {displayTab === '2 · Supply Disruption Risk' && <SupplyDisruptionRisk />}
      {displayTab === '3 · Pandemic Preparedness' && <PandemicPreparedness />}
      {displayTab === '4 · Supplier Alternatives' && <SupplierAlternatives />}
      {displayTab === '5 · AI Risk Intelligence' && canAccessAiRisk && <AiRiskIntelligence role={role} />}
    </div>
  );
}
