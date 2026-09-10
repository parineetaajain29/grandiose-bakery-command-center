import { getFeedback, getGoals, updateGoalStatus, useApiData } from '../../../data/api';
import type { GoalStatus } from '../../../data';
import { useState } from 'react';

const GOAL_STATUS_CLASS: Record<GoalStatus, string> = {
  active: 'text-accent-blue border-accent-blue/40',
  completed: 'text-accent-green border-accent-green/40',
  overdue: 'text-accent-red border-accent-red/40',
  cancelled: 'text-text-secondary border-border-subtle',
};

export function GoalsFeedbackManager({ onSelectEmployee }: { onSelectEmployee: (id: string) => void }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const goalsState = useApiData(() => getGoals(), [refreshKey]);
  const feedbackState = useApiData(() => getFeedback(), [refreshKey]);

  async function handleStatusChange(id: number, status: GoalStatus) {
    await updateGoalStatus(id, status);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
        <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">GOALS & FEEDBACK</p>
        <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary">Goals across your team</h2>
        <p className="mt-1 font-mono text-sm text-text-secondary">Open an employee's profile to set a new goal or add feedback.</p>

        <div className="mt-4 flex flex-col gap-2">
          {goalsState.status === 'ready' &&
            goalsState.data.map((g) => (
              <div key={g.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle p-3">
                <div>
                  <button type="button" onClick={() => onSelectEmployee(g.employeeId)} className="font-mono text-xs text-accent-blue hover:underline">
                    {g.employeeId}
                  </button>
                  <p className="font-sans text-sm text-text-primary">{g.title}</p>
                  {g.deadline && <p className="font-mono text-[11px] text-text-secondary">Due {g.deadline}</p>}
                </div>
                <select
                  value={g.status}
                  onChange={(e) => handleStatusChange(g.id, e.target.value as GoalStatus)}
                  className={`rounded-full border bg-bg-primary px-2.5 py-1 font-mono text-[11px] ${GOAL_STATUS_CLASS[g.status]}`}
                >
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="overdue">Overdue</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            ))}
          {goalsState.status === 'ready' && goalsState.data.length === 0 && <p className="font-mono text-sm text-text-secondary">No goals in scope.</p>}
        </div>
      </section>

      <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
        <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">RECENT FEEDBACK</p>
        <div className="mt-4 flex flex-col gap-2">
          {feedbackState.status === 'ready' &&
            feedbackState.data.map((f) => (
              <div key={f.id} className="rounded-lg border border-border-subtle p-3">
                <button type="button" onClick={() => onSelectEmployee(f.employeeId)} className="font-mono text-xs text-accent-blue hover:underline">
                  {f.employeeId}
                </button>
                <p className="mt-1 font-mono text-[11px] text-text-secondary">{f.category}</p>
                <p className="mt-1 font-mono text-sm text-text-secondary">{f.comment}</p>
                <p className="mt-1 font-mono text-[11px] text-text-secondary">{f.acknowledgedAt ? 'Acknowledged' : 'Awaiting acknowledgement'}</p>
              </div>
            ))}
          {feedbackState.status === 'ready' && feedbackState.data.length === 0 && <p className="font-mono text-sm text-text-secondary">No feedback in scope.</p>}
        </div>
      </section>
    </div>
  );
}
