import { useState } from 'react';
import type { AuthUser } from '../../data';
import { DailyLogForm } from './employeeWorkspace/DailyLogForm';
import { MyPerformance } from './employeeWorkspace/MyPerformance';
import { GoalsFeedback } from './employeeWorkspace/GoalsFeedback';
import { Alerts } from './managerWorkspace/Alerts';

interface EmployeeWorkspaceProps {
  user: AuthUser;
  onLogout: () => void;
}

const TABS = ['Daily Log', 'My Performance', 'Goals & Feedback', 'Alerts'] as const;
type Tab = (typeof TABS)[number];

export function EmployeeWorkspace({ user, onLogout }: EmployeeWorkspaceProps) {
  const [tab, setTab] = useState<Tab>('Daily Log');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Employee workspace">
          {TABS.map((t) => {
            const isActive = t === tab;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(t)}
                className={`rounded-full border px-4 py-2 font-mono text-xs tracking-wide transition-colors ${
                  isActive
                    ? 'border-accent-blue bg-accent-blue text-[#04070d]'
                    : 'border-border-subtle bg-bg-panel text-text-secondary hover:border-accent-blue/50 hover:text-text-primary'
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-full border border-border-subtle px-4 py-2 font-mono text-xs text-text-secondary transition-colors hover:border-accent-red/50 hover:text-accent-red"
        >
          Log out
        </button>
      </div>

      {tab === 'Daily Log' && <DailyLogForm user={user} />}
      {tab === 'My Performance' && <MyPerformance user={user} />}
      {tab === 'Goals & Feedback' && <GoalsFeedback user={user} />}
      {tab === 'Alerts' && <Alerts />}
    </div>
  );
}
