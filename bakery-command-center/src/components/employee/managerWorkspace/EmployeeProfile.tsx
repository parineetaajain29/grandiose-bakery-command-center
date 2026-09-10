import { useState } from 'react';
import {
  adminActivate,
  adminDeactivate,
  adminResetPin,
  getComparativeMetrics,
  getEmployee,
  getFeedback,
  getGoals,
  saveFeedback,
  saveGoal,
  useApiData,
} from '../../../data/api';
import type { Role } from '../../../data';
import { formatHoursFromMinutes, formatPercentPrecise } from '../../../lib/format';
import { KpiCard, KpiCardGrid } from '../shared/KpiCard';
import { PeriodWindowSelector, dateRangeForWindow, type PeriodWindow } from '../shared/PeriodWindowSelector';
import { TimeAllocationBar } from '../shared/TimeAllocationBar';

interface EmployeeProfileProps {
  employeeId: string;
  viewerRole: Role;
}

const ROLE_LABEL: Record<Role, string> = { employee: 'Employee', supervisor: 'Supervisor', manager: 'Manager', hr_admin: 'HR / Admin' };

export function EmployeeProfile({ employeeId, viewerRole }: EmployeeProfileProps) {
  const [window_, setWindow] = useState<PeriodWindow>(30);
  const { from, to } = dateRangeForWindow(window_);
  const [refreshKey, setRefreshKey] = useState(0);

  const employeeState = useApiData(() => getEmployee(employeeId), [employeeId, refreshKey]);
  const metricsState = useApiData(() => getComparativeMetrics(employeeId, from, to), [employeeId, from, to]);
  const goalsState = useApiData(() => getGoals(employeeId), [employeeId, refreshKey]);
  const feedbackState = useApiData(() => getFeedback(employeeId), [employeeId, refreshKey]);

  const isHrAdmin = viewerRole === 'hr_admin';
  const canManage = viewerRole === 'supervisor' || viewerRole === 'manager' || viewerRole === 'hr_admin';

  const [adminBusy, setAdminBusy] = useState(false);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);

  async function handleResetPin() {
    setAdminBusy(true);
    try {
      const { newPin } = await adminResetPin(employeeId);
      setAdminMessage(`New PIN: ${newPin} — share with the employee out-of-band.`);
    } finally {
      setAdminBusy(false);
    }
  }

  async function handleToggleActive(active: boolean) {
    setAdminBusy(true);
    try {
      await (active ? adminActivate(employeeId) : adminDeactivate(employeeId));
      setRefreshKey((k) => k + 1);
    } finally {
      setAdminBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {employeeState.status === 'ready' && (
        <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
          <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">PROFILE</p>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-sans text-xl font-semibold text-text-primary">{employeeState.data.name}</h2>
            <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] ${employeeState.data.active ? 'border-accent-green/40 text-accent-green' : 'border-accent-red/40 text-accent-red'}`}>
              {employeeState.data.active ? 'Active' : 'Deactivated'}
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-sm sm:grid-cols-4">
            <dt className="text-text-secondary">ID</dt>
            <dd className="text-text-primary">{employeeState.data.id}</dd>
            <dt className="text-text-secondary">Department</dt>
            <dd className="text-text-primary">{employeeState.data.department}</dd>
            <dt className="text-text-secondary">Role</dt>
            <dd className="text-text-primary">{ROLE_LABEL[employeeState.data.role]}</dd>
            <dt className="text-text-secondary">Shift</dt>
            <dd className="text-text-primary">{employeeState.data.shift}</dd>
          </dl>

          {isHrAdmin && (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4">
              <button type="button" onClick={handleResetPin} disabled={adminBusy} className="rounded-full border border-border-subtle px-3 py-1.5 font-mono text-[11px] text-text-secondary hover:text-text-primary disabled:opacity-50">
                Reset PIN
              </button>
              <button
                type="button"
                onClick={() => handleToggleActive(!employeeState.data.active)}
                disabled={adminBusy}
                className="rounded-full border border-border-subtle px-3 py-1.5 font-mono text-[11px] text-text-secondary hover:text-text-primary disabled:opacity-50"
              >
                {employeeState.data.active ? 'Deactivate' : 'Activate'}
              </button>
              {adminMessage && <p className="font-mono text-[11px] text-accent-green">{adminMessage}</p>}
            </div>
          )}
        </section>
      )}

      <PeriodWindowSelector value={window_} onChange={setWindow} />

      {metricsState.status === 'ready' && (
        <>
          <KpiCardGrid>
            <KpiCard eyebrow="TRUE EFFICIENCY" value={formatPercentPrecise(metricsState.data.employee.trueEfficiencyPct)} />
            <KpiCard eyebrow="PERFORMANCE WHILE WORKING" value={formatPercentPrecise(metricsState.data.employee.performanceWhileWorkingPct)} />
            <KpiCard eyebrow="PRODUCTIVE HOURS" value={formatHoursFromMinutes(metricsState.data.employee.productiveMinutes)} />
            <KpiCard
              eyebrow="VS. DEPARTMENT"
              value={`${(metricsState.data.employee.trueEfficiencyPct - metricsState.data.department.trueEfficiencyPct) >= 0 ? '+' : ''}${(
                metricsState.data.employee.trueEfficiencyPct - metricsState.data.department.trueEfficiencyPct
              ).toFixed(1)} pp`}
            />
          </KpiCardGrid>

          <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
            <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">TIME ALLOCATION</p>
            <div className="mt-3">
              <TimeAllocationBar result={metricsState.data.employee} />
            </div>
          </section>
        </>
      )}

      {canManage && <GoalAndFeedbackTools employeeId={employeeId} onSaved={() => setRefreshKey((k) => k + 1)} />}

      <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
        <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">GOALS</p>
        {goalsState.status === 'ready' && goalsState.data.length === 0 && <p className="mt-3 font-mono text-sm text-text-secondary">No goals set.</p>}
        <div className="mt-3 flex flex-col gap-2">
          {goalsState.status === 'ready' &&
            goalsState.data.map((g) => (
              <div key={g.id} className="rounded-lg border border-border-subtle p-3">
                <p className="font-sans text-sm text-text-primary">{g.title}</p>
                <p className="font-mono text-[11px] text-text-secondary">
                  {g.status} {g.deadline && `· due ${g.deadline}`}
                </p>
              </div>
            ))}
        </div>
      </section>

      <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
        <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">FEEDBACK HISTORY</p>
        {feedbackState.status === 'ready' && feedbackState.data.length === 0 && <p className="mt-3 font-mono text-sm text-text-secondary">No feedback yet.</p>}
        <div className="mt-3 flex flex-col gap-2">
          {feedbackState.status === 'ready' &&
            feedbackState.data.map((f) => (
              <div key={f.id} className="rounded-lg border border-border-subtle p-3">
                <p className="font-mono text-[11px] text-text-secondary">
                  {f.category} · {new Date(f.createdAt).toLocaleDateString()}
                </p>
                <p className="mt-1 font-mono text-sm text-text-secondary">{f.comment}</p>
                <p className="mt-1 font-mono text-[11px] text-text-secondary">
                  {f.acknowledgedAt ? `Acknowledged ${new Date(f.acknowledgedAt).toLocaleDateString()}` : 'Not yet acknowledged'}
                  {f.employeeResponse && ` · Response: ${f.employeeResponse}`}
                </p>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}

function GoalAndFeedbackTools({ employeeId, onSaved }: { employeeId: string; onSaved: () => void }) {
  const [mode, setMode] = useState<'none' | 'goal' | 'feedback'>('none');

  return (
    <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setMode(mode === 'goal' ? 'none' : 'goal')} className="rounded-full border border-accent-blue px-3.5 py-1.5 font-mono text-xs text-accent-blue hover:bg-accent-blue hover:text-[#04070d]">
          Set Goal
        </button>
        <button type="button" onClick={() => setMode(mode === 'feedback' ? 'none' : 'feedback')} className="rounded-full border border-accent-blue px-3.5 py-1.5 font-mono text-xs text-accent-blue hover:bg-accent-blue hover:text-[#04070d]">
          Add Feedback
        </button>
      </div>

      {mode === 'goal' && <GoalForm employeeId={employeeId} onSaved={() => { onSaved(); setMode('none'); }} />}
      {mode === 'feedback' && <FeedbackForm employeeId={employeeId} onSaved={() => { onSaved(); setMode('none'); }} />}
    </section>
  );
}

function GoalForm({ employeeId, onSaved }: { employeeId: string; onSaved: () => void }) {
  const [title, setTitle] = useState('');
  const [metric, setMetric] = useState('trueEfficiencyPct');
  const [baseline, setBaseline] = useState('');
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await saveGoal({
        employeeId,
        title,
        metric,
        baseline: baseline === '' ? null : Number(baseline),
        target: target === '' ? null : Number(target),
        deadline: deadline || null,
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  const inputClass = 'mt-1 w-full rounded-lg border border-border-subtle bg-bg-primary px-3 py-2 font-mono text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none';
  const labelClass = 'font-mono text-[11px] tracking-[0.1em] text-text-secondary';

  return (
    <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-3 border-t border-border-subtle pt-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="sm:col-span-2 lg:col-span-3">
        <label className={labelClass}>TITLE</label>
        <input required value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>METRIC</label>
        <select value={metric} onChange={(e) => setMetric(e.target.value)} className={inputClass}>
          <option value="trueEfficiencyPct">True Efficiency (%)</option>
          <option value="performanceWhileWorkingPct">Performance While Working (%)</option>
          <option value="downtimeMinutes">Downtime (min/day)</option>
          <option value="changeoverMinutes">Changeover (min/day)</option>
        </select>
      </div>
      <div>
        <label className={labelClass}>BASELINE</label>
        <input type="number" value={baseline} onChange={(e) => setBaseline(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>TARGET</label>
        <input type="number" value={target} onChange={(e) => setTarget(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>DEADLINE</label>
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputClass} />
      </div>
      <div className="flex items-end">
        <button type="submit" disabled={busy} className="rounded-full border border-accent-blue bg-accent-blue px-4 py-2 font-mono text-xs text-[#04070d] disabled:opacity-50">
          {busy ? 'Saving…' : 'Save goal'}
        </button>
      </div>
    </form>
  );
}

const FEEDBACK_CATEGORIES = ['Productivity', 'Quality', 'Changeover', 'Reliability', 'Improvement', 'Recognition', 'General'];

function FeedbackForm({ employeeId, onSaved }: { employeeId: string; onSaved: () => void }) {
  const [category, setCategory] = useState(FEEDBACK_CATEGORIES[0]);
  const [assessment, setAssessment] = useState('');
  const [comment, setComment] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await saveFeedback({ employeeId, category, assessment: assessment || null, comment, followUpDate: followUpDate || null });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  const inputClass = 'mt-1 w-full rounded-lg border border-border-subtle bg-bg-primary px-3 py-2 font-mono text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none';
  const labelClass = 'font-mono text-[11px] tracking-[0.1em] text-text-secondary';

  return (
    <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-3 border-t border-border-subtle pt-4 sm:grid-cols-2">
      <div>
        <label className={labelClass}>CATEGORY</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
          {FEEDBACK_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>ASSESSMENT (OPTIONAL)</label>
        <input value={assessment} onChange={(e) => setAssessment(e.target.value)} placeholder="e.g. Needs improvement" className={inputClass} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass}>COMMENT</label>
        <textarea required rows={3} value={comment} onChange={(e) => setComment(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>FOLLOW-UP DATE (OPTIONAL)</label>
        <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className={inputClass} />
      </div>
      <div className="flex items-end">
        <button type="submit" disabled={busy} className="rounded-full border border-accent-blue bg-accent-blue px-4 py-2 font-mono text-xs text-[#04070d] disabled:opacity-50">
          {busy ? 'Saving…' : 'Save feedback'}
        </button>
      </div>
    </form>
  );
}
