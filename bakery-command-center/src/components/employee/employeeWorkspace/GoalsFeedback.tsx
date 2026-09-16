import { useState } from 'react';
import { acknowledgeFeedback, getEmployeeMetrics, getFeedback, getGoals, useApiData } from '../../../data/api';
import type { AuthUser } from '../../../data';
import type { LabourResult } from '../../../lib/labourCalc';
import { dateRangeForWindow } from '../shared/PeriodWindowSelector';

interface GoalsFeedbackProps {
  user: AuthUser;
}

const METRIC_LABEL: Record<string, string> = {
  trueEfficiencyPct: 'True Efficiency (%)',
  performanceWhileWorkingPct: 'Performance While Working (%)',
  downtimeMinutes: 'Downtime (min/day, lower is better)',
  changeoverMinutes: 'Changeover (min/day, lower is better)',
};

function currentMetricValue(metric: string | null, result: LabourResult): number | null {
  if (metric === 'trueEfficiencyPct') return result.trueEfficiencyPct;
  if (metric === 'performanceWhileWorkingPct') return result.performanceWhileWorkingPct;
  if (metric === 'downtimeMinutes') return result.daysLogged === 0 ? null : result.downtimeMinutes / result.daysLogged;
  if (metric === 'changeoverMinutes') return result.daysLogged === 0 ? null : result.changeoverMinutes / result.daysLogged;
  return null;
}

function GoalProgress({ metric, baseline, target, current }: { metric: string | null; baseline: number | null; target: number | null; current: number | null }) {
  if (!metric || baseline === null || target === null || current === null) return null;
  const lowerIsBetter = metric.includes('Minutes');
  const span = Math.abs(target - baseline) || 1;
  const progressed = lowerIsBetter ? baseline - current : current - baseline;
  const pct = Math.max(0, Math.min(100, (progressed / span) * 100));
  return (
    <div className="mt-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border-subtle">
        <div className="h-full bg-accent-blue" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 font-sans text-xs text-text-tertiary">
        Current: {current.toFixed(1)} · Baseline {baseline} → Target {target}
      </p>
    </div>
  );
}

const GOAL_STATUS_CLASS: Record<string, string> = {
  active: 'text-accent-blue border-accent-blue/40',
  completed: 'text-accent-green border-accent-green/40',
  overdue: 'text-accent-red border-accent-red/40',
  cancelled: 'text-text-secondary border-border-subtle',
};

export function GoalsFeedback({ user }: GoalsFeedbackProps) {
  const goalsState = useApiData(() => getGoals(user.id), [user.id]);
  const feedbackState = useApiData(() => getFeedback(user.id), [user.id]);
  const { from, to } = dateRangeForWindow(30);
  const metricsState = useApiData(() => getEmployeeMetrics(user.id, from, to), [user.id, from, to]);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
        <p className="font-sans text-xs font-medium text-text-tertiary">Goals</p>
        <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary">Active goals</h2>

        {goalsState.status === 'ready' && goalsState.data.length === 0 && (
          <p className="mt-3 font-sans text-sm text-text-secondary">No goals set yet.</p>
        )}

        <div className="mt-4 flex flex-col gap-4">
          {goalsState.status === 'ready' &&
            goalsState.data.map((goal) => (
              <div key={goal.id} className="rounded-card border border-border-subtle p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-sans text-sm font-semibold text-text-primary">{goal.title}</p>
                    {goal.metric && <p className="font-sans text-xs text-text-tertiary">{METRIC_LABEL[goal.metric] ?? goal.metric}</p>}
                  </div>
                  <span className={`rounded-full border px-2.5 py-0.5 font-sans text-[11px] font-medium uppercase ${GOAL_STATUS_CLASS[goal.status]}`}>
                    {goal.status}
                  </span>
                </div>
                {goal.deadline && <p className="mt-1.5 font-sans text-xs text-text-tertiary">Deadline: {goal.deadline}</p>}
                {goal.notes && <p className="mt-1.5 font-sans text-xs text-text-secondary">{goal.notes}</p>}
                {metricsState.status === 'ready' && (
                  <GoalProgress
                    metric={goal.metric}
                    baseline={goal.baseline}
                    target={goal.target}
                    current={currentMetricValue(goal.metric, metricsState.data)}
                  />
                )}
              </div>
            ))}
        </div>
      </section>

      <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
        <p className="font-sans text-xs font-medium text-text-tertiary">Feedback</p>
        <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary">Manager feedback</h2>

        {feedbackState.status === 'ready' && feedbackState.data.length === 0 && (
          <p className="mt-3 font-sans text-sm text-text-secondary">No feedback yet.</p>
        )}

        <div className="mt-4 flex flex-col gap-4">
          {feedbackState.status === 'ready' &&
            feedbackState.data.map((item) => <FeedbackCard key={item.id} feedback={item} />)}
        </div>
      </section>
    </div>
  );
}

function FeedbackCard({ feedback }: { feedback: import('../../../data').Feedback }) {
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const [acknowledgedAt, setAcknowledgedAt] = useState(feedback.acknowledgedAt);
  const [savedResponse, setSavedResponse] = useState(feedback.employeeResponse);

  async function handleAcknowledge() {
    setBusy(true);
    try {
      const updated = await acknowledgeFeedback(feedback.id, response || null);
      setAcknowledgedAt(updated.acknowledgedAt);
      setSavedResponse(updated.employeeResponse);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border border-border-subtle p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full border border-border-subtle px-2.5 py-0.5 font-sans text-[11px] font-medium text-text-secondary">{feedback.category}</span>
        <span className="font-sans text-xs text-text-tertiary">{new Date(feedback.createdAt).toLocaleDateString()}</span>
      </div>
      {feedback.assessment && <p className="mt-2 font-sans text-sm font-semibold text-text-primary">{feedback.assessment}</p>}
      <p className="mt-1.5 font-sans text-sm text-text-secondary">{feedback.comment}</p>
      {feedback.followUpDate && <p className="mt-1.5 font-sans text-xs text-text-tertiary">Follow-up: {feedback.followUpDate}</p>}

      {acknowledgedAt ? (
        <div className="mt-3 border-t border-border-subtle pt-3">
          <p className="font-sans text-xs font-medium text-accent-green">Acknowledged {new Date(acknowledgedAt).toLocaleDateString()}</p>
          {savedResponse && <p className="mt-1 font-sans text-xs text-text-secondary">Your response: {savedResponse}</p>}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-3 sm:flex-row sm:items-center">
          <input
            type="text"
            placeholder="Optional response…"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            className="flex-1 rounded-lg border border-border-subtle bg-bg-primary px-3 py-1.5 font-sans text-xs text-text-primary focus:border-accent-blue/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAcknowledge}
            disabled={busy}
            className="rounded-full border border-accent-blue px-3 py-1.5 font-sans text-xs font-medium text-accent-blue transition-colors hover:bg-accent-blue hover:text-[#04070d] disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Acknowledge'}
          </button>
        </div>
      )}
    </div>
  );
}
