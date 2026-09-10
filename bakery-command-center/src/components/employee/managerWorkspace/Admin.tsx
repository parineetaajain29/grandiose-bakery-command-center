import { useState } from 'react';
import { adminActivate, adminDeactivate, adminResetPin, getEmployees, useApiData } from '../../../data/api';

const ROLE_LABEL: Record<string, string> = { employee: 'Employee', supervisor: 'Supervisor', manager: 'Manager', hr_admin: 'HR / Admin' };

export function Admin({ onSelectEmployee }: { onSelectEmployee: (id: string) => void }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const state = useApiData(() => getEmployees(), [refreshKey]);

  async function handleResetPin(id: string) {
    setBusyId(id);
    try {
      const { newPin } = await adminResetPin(id);
      setMessage(`New PIN for ${id}: ${newPin} — share with the employee out-of-band.`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggle(id: string, active: boolean) {
    setBusyId(id);
    try {
      await (active ? adminActivate(id) : adminDeactivate(id));
      setRefreshKey((k) => k + 1);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
      <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">ADMIN — HR ONLY</p>
      <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary">Account administration</h2>
      {message && <p className="mt-2 font-mono text-xs text-accent-green">{message}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border-subtle font-mono text-[11px] tracking-wide text-text-secondary">
              <th className="py-2 pr-4 font-normal">Employee</th>
              <th className="py-2 pr-4 font-normal">Department</th>
              <th className="py-2 pr-4 font-normal">Role</th>
              <th className="py-2 pr-4 font-normal">Status</th>
              <th className="py-2 pr-4 font-normal" />
            </tr>
          </thead>
          <tbody className="font-mono text-sm">
            {state.status === 'ready' &&
              state.data.map((e) => (
                <tr key={e.id} className="border-b border-border-subtle/60 last:border-0">
                  <td className="py-2 pr-4">
                    <button type="button" onClick={() => onSelectEmployee(e.id)} className="text-text-primary hover:text-accent-blue hover:underline">
                      {e.name}
                    </button>
                    <span className="ml-1.5 text-[11px] text-text-secondary">({e.id})</span>
                  </td>
                  <td className="py-2 pr-4 text-text-secondary">{e.department}</td>
                  <td className="py-2 pr-4 text-text-secondary">{ROLE_LABEL[e.role]}</td>
                  <td className="py-2 pr-4">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${e.active ? 'border-accent-green/40 text-accent-green' : 'border-accent-red/40 text-accent-red'}`}>
                      {e.active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <button type="button" disabled={busyId === e.id} onClick={() => handleResetPin(e.id)} className="mr-3 font-mono text-[11px] text-accent-blue hover:underline disabled:opacity-50">
                      Reset PIN
                    </button>
                    <button
                      type="button"
                      disabled={busyId === e.id}
                      onClick={() => handleToggle(e.id, !e.active)}
                      className="font-mono text-[11px] text-text-secondary hover:text-text-primary disabled:opacity-50"
                    >
                      {e.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
