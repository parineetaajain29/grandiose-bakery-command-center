import { getAuditLogs, useApiData } from '../../../data/api';

const ACTION_LABEL: Record<string, string> = {
  login: 'Login',
  logout: 'Logout',
  login_failed: 'Login failed',
  login_failed_deactivated: 'Login rejected (deactivated)',
  login_locked: 'Login locked out',
  daily_log_created: 'Daily log created',
  daily_log_edited: 'Daily log edited',
  goal_created: 'Goal created',
  goal_updated: 'Goal updated',
  feedback_created: 'Feedback created',
  feedback_acknowledged: 'Feedback acknowledged',
  pin_reset: 'PIN reset',
  employee_activated: 'Employee activated',
  employee_deactivated: 'Employee deactivated',
};

export function AuditLog() {
  const state = useApiData(() => getAuditLogs(), []);

  return (
    <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
      <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">AUDIT LOG</p>
      <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary">Recent activity</h2>
      <p className="mt-1 font-mono text-sm text-text-secondary">PIN values are never stored here — attribution only.</p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border-subtle font-mono text-[11px] tracking-wide text-text-secondary">
              <th className="py-2 pr-4 font-normal">Time</th>
              <th className="py-2 pr-4 font-normal">Actor</th>
              <th className="py-2 pr-4 font-normal">Role</th>
              <th className="py-2 pr-4 font-normal">Action</th>
              <th className="py-2 pr-4 font-normal">Affected</th>
              <th className="py-2 pr-4 font-normal">Details</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {state.status === 'ready' &&
              state.data.map((event) => (
                <tr key={event.id} className="border-b border-border-subtle/60 last:border-0">
                  <td className="py-2 pr-4 text-text-secondary">{new Date(event.at).toLocaleString()}</td>
                  <td className="py-2 pr-4 text-text-primary">{event.actorName ?? event.actorEmployeeId ?? '—'}</td>
                  <td className="py-2 pr-4 text-text-secondary">{event.actorRole ?? '—'}</td>
                  <td className="py-2 pr-4 text-text-secondary">{ACTION_LABEL[event.action] ?? event.action}</td>
                  <td className="py-2 pr-4 text-text-secondary">{event.affectedName ?? event.affectedEmployeeId ?? '—'}</td>
                  <td className="py-2 pr-4 text-text-secondary">{event.details ?? '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
