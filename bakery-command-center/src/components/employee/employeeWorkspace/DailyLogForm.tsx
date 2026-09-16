import { useMemo, useState } from 'react';
import { getDailyLogs, saveDailyLog, updateDailyLog, useApiData, type DailyLogWriteInput } from '../../../data/api';
import type { AuthUser, DailyLog } from '../../../data';
import { LABOUR_CONFIG } from '../../../config/labourConfig';
import {
  ACTIVITY_TYPES,
  CHANGEOVER_CAUSES,
  DOWNTIME_CAUSES,
  VALID_SHIFTS,
  deriveProductiveMinutes,
  validateDailyLogInput,
  type ActivityType,
  type DailyLogInput,
} from '../../../lib/labourCalc';
import { formatMinutes } from '../../../lib/format';

interface DailyLogFormProps {
  user: AuthUser;
}

interface FormFields {
  date: string;
  shift: string;
  paidMinutes: string;
  breakMinutes: string;
  changeoverMinutes: string;
  changeoverCauseCode: string;
  downtimeMinutes: string;
  downtimeCauseCode: string;
  idleMinutes: string;
  activityType: ActivityType;
  unitsProduced: string;
  notes: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFields(shift: string): FormFields {
  return {
    date: todayIso(),
    shift,
    paidMinutes: String(Math.round(LABOUR_CONFIG.shiftLengthHours * 60)),
    breakMinutes: String(LABOUR_CONFIG.breakMinutesPerShift),
    changeoverMinutes: '',
    changeoverCauseCode: '',
    downtimeMinutes: '',
    downtimeCauseCode: '',
    idleMinutes: '',
    activityType: 'production',
    unitsProduced: '',
    notes: '',
  };
}

export function DailyLogForm({ user }: DailyLogFormProps) {
  const [fields, setFields] = useState<FormFields>(() => defaultFields(user.shift ?? 'Morning'));
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'success' | 'error'; message?: string }>({ kind: 'idle' });
  // Tracks whether the user has edited the form since it was last reset (fresh
  // load, post-reset, or post-successful-save) — the default blank form is
  // itself invalid (units produced is required), so the live clientErrors
  // preview below must not fire against a form nobody has touched yet.
  const [touched, setTouched] = useState(false);

  const recentState = useApiData(
    () => getDailyLogs({ employeeId: user.id, from: shiftDate(todayIso(), -6), to: todayIso() }),
    [user.id, status.kind],
  );

  function setField<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
    setTouched(true);
    // A prior success/error banner describes the last submit attempt, not this
    // edit — clear it the moment the user starts changing the form again,
    // rather than leaving it to sit alongside newly-live validation output.
    setStatus((s) => (s.kind === 'success' || s.kind === 'error' ? { kind: 'idle' } : s));
  }

  const input: DailyLogInput = useMemo(
    () => ({
      date: fields.date,
      shift: fields.shift,
      paidMinutes: Number(fields.paidMinutes),
      breakMinutes: Number(fields.breakMinutes),
      changeoverMinutes: Number(fields.changeoverMinutes || 0),
      changeoverCauseCode: fields.changeoverCauseCode || null,
      downtimeMinutes: Number(fields.downtimeMinutes || 0),
      downtimeCauseCode: fields.downtimeCauseCode || null,
      idleMinutes: Number(fields.idleMinutes || 0),
      activityType: fields.activityType,
      unitsProduced: fields.unitsProduced === '' ? null : Number(fields.unitsProduced),
    }),
    [fields],
  );

  // Productive minutes is never entered — it's the one number that used to be
  // self-reported and drove every efficiency figure with no check. It's now a
  // live read-only display of the same derivation the server uses authoritatively.
  const derivedProductiveMinutes = useMemo(() => deriveProductiveMinutes(input), [input]);
  const clientErrors = useMemo(() => validateDailyLogInput(input), [input]);

  function startEdit(log: DailyLog) {
    setEditingLogId(log.id);
    setFields({
      date: log.date,
      shift: log.shift,
      paidMinutes: String(log.paidMinutes),
      breakMinutes: String(log.breakMinutes),
      changeoverMinutes: String(log.changeoverMinutes),
      changeoverCauseCode: log.changeoverCauseCode ?? '',
      downtimeMinutes: String(log.downtimeMinutes),
      downtimeCauseCode: log.downtimeCauseCode ?? '',
      idleMinutes: String(log.idleMinutes),
      activityType: log.activityType === 'non_production' ? 'non_production' : 'production',
      unitsProduced: log.unitsProduced == null ? '' : String(log.unitsProduced),
      notes: log.notes ?? '',
    });
    setStatus({ kind: 'idle' });
    setTouched(false);
  }

  function resetForm() {
    setEditingLogId(null);
    setFields(defaultFields(user.shift ?? 'Morning'));
    setStatus({ kind: 'idle' });
    setTouched(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (clientErrors.length > 0) {
      setStatus({ kind: 'error', message: clientErrors.join(' ') });
      return;
    }

    const writeInput: DailyLogWriteInput = {
      ...input,
      notes: fields.notes || null,
    };

    setStatus({ kind: 'saving' });
    try {
      if (editingLogId) {
        await updateDailyLog(editingLogId, writeInput);
        setStatus({ kind: 'success', message: `Updated ${fields.date} (${fields.shift}).` });
      } else {
        await saveDailyLog(writeInput);
        setStatus({ kind: 'success', message: `Logged ${fields.date} (${fields.shift}).` });
      }
      setEditingLogId(null);
      setFields(defaultFields(user.shift ?? 'Morning'));
      setTouched(false);
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  const inputClass =
    'mt-1 w-full rounded-lg border border-border-subtle bg-bg-primary px-3 py-2 font-sans text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none';
  const readOnlyClass =
    'mt-1 w-full rounded-lg border border-border-subtle bg-bg-primary/60 px-3 py-2 font-sans text-sm text-text-secondary';
  const labelClass = 'font-sans text-xs font-medium text-text-tertiary';

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
        <p className="font-sans text-xs font-medium text-text-tertiary">Daily Log</p>
        <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary">
          {editingLogId ? 'Edit today’s entry' : 'Log today’s shift'}
        </h2>
        <p className="mt-1 max-w-2xl font-sans text-sm text-text-secondary">
          Enter break, changeover, downtime, and idle/other minutes — Productive Minutes is calculated from these, it's
          never entered directly. True Efficiency and Performance While Working are then calculated from that.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelClass} htmlFor="dl-date">Date</label>
            <input id="dl-date" type="date" max={todayIso()} value={fields.date} onChange={(e) => setField('date', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="dl-shift">Shift</label>
            <select id="dl-shift" value={fields.shift} onChange={(e) => setField('shift', e.target.value)} className={inputClass}>
              {VALID_SHIFTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="dl-activity-type">Shift Type</label>
            <select
              id="dl-activity-type"
              value={fields.activityType}
              onChange={(e) => setField('activityType', e.target.value as ActivityType)}
              className={inputClass}
            >
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === 'production' ? 'Production' : 'Non-production — cleaning, training, no countable output'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="dl-paid">Paid Minutes</label>
            <input id="dl-paid" type="number" min={0} value={fields.paidMinutes} onChange={(e) => setField('paidMinutes', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="dl-break">Break Minutes</label>
            <input id="dl-break" type="number" min={0} value={fields.breakMinutes} onChange={(e) => setField('breakMinutes', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="dl-changeover">Changeover Minutes</label>
            <input
              id="dl-changeover"
              type="number"
              min={0}
              value={fields.changeoverMinutes}
              onChange={(e) => setField('changeoverMinutes', e.target.value)}
              className={inputClass}
            />
          </div>
          {Number(fields.changeoverMinutes || 0) > 0 && (
            <div>
              <label className={labelClass} htmlFor="dl-changeover-cause">Changeover Cause</label>
              <select
                id="dl-changeover-cause"
                value={fields.changeoverCauseCode}
                onChange={(e) => setField('changeoverCauseCode', e.target.value)}
                className={inputClass}
              >
                <option value="">Select a cause…</option>
                {CHANGEOVER_CAUSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={labelClass} htmlFor="dl-downtime">Downtime Minutes</label>
            <input id="dl-downtime" type="number" min={0} value={fields.downtimeMinutes} onChange={(e) => setField('downtimeMinutes', e.target.value)} className={inputClass} />
          </div>
          {Number(fields.downtimeMinutes || 0) > 0 && (
            <div>
              <label className={labelClass} htmlFor="dl-downtime-cause">Downtime Cause</label>
              <select
                id="dl-downtime-cause"
                value={fields.downtimeCauseCode}
                onChange={(e) => setField('downtimeCauseCode', e.target.value)}
                className={inputClass}
              >
                <option value="">Select a cause…</option>
                {DOWNTIME_CAUSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={labelClass} htmlFor="dl-idle">Idle / Other Minutes</label>
            <input id="dl-idle" type="number" min={0} value={fields.idleMinutes} onChange={(e) => setField('idleMinutes', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="dl-productive">Productive Minutes (Calculated)</label>
            <input id="dl-productive" readOnly value={derivedProductiveMinutes} className={readOnlyClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="dl-units">
              Units Produced{fields.activityType === 'production' ? '' : ' (Optional)'}
            </label>
            <input id="dl-units" type="number" min={0} value={fields.unitsProduced} onChange={(e) => setField('unitsProduced', e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={labelClass} htmlFor="dl-notes">Notes (Optional)</label>
            <textarea id="dl-notes" rows={2} value={fields.notes} onChange={(e) => setField('notes', e.target.value)} className={inputClass} />
          </div>

          {touched && clientErrors.length > 0 && (
            <div className="sm:col-span-2 lg:col-span-3">
              {clientErrors.map((err) => (
                <p key={err} className="font-sans text-xs text-accent-red">
                  {err}
                </p>
              ))}
            </div>
          )}

          <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={status.kind === 'saving'}
              className="rounded-full border border-accent-blue bg-accent-blue px-5 py-2 font-sans text-xs font-semibold tracking-wide text-[#04070d] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {status.kind === 'saving' ? 'Saving…' : editingLogId ? 'Update entry' : 'Save log'}
            </button>
            {editingLogId && (
              <button type="button" onClick={resetForm} className="font-sans text-xs text-text-secondary hover:text-text-primary">
                Cancel edit
              </button>
            )}
            {status.kind === 'success' && <p className="font-sans text-xs text-accent-green">{status.message}</p>}
            {status.kind === 'error' && <p className="font-sans text-xs text-accent-red">{status.message}</p>}
          </div>
        </form>
      </section>

      <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
        <p className="font-sans text-xs font-medium text-text-tertiary">Recent Entries</p>
        <h2 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">Last 7 days</h2>
        <p className="mt-1 font-sans text-xs text-text-tertiary">Only today's entry can be edited — older records are locked.</p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border-subtle font-sans text-xs font-medium text-text-secondary">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Shift</th>
                <th className="py-2 pr-4 text-right font-medium">Productive</th>
                <th className="py-2 pr-4 text-right font-medium">Downtime</th>
                <th className="py-2 pr-4 text-right font-medium">Changeover</th>
                <th className="py-2 pr-4 font-medium" />
              </tr>
            </thead>
            <tbody className="font-sans text-sm">
              {recentState.status === 'ready' &&
                [...recentState.data].reverse().map((log) => (
                  <tr key={log.id} className="border-b border-border-subtle/60 last:border-0">
                    <td className="py-2 pr-4 text-text-primary">{log.date}</td>
                    <td className="py-2 pr-4 text-text-secondary">{log.shift}</td>
                    <td className="py-2 pr-4 text-right font-mono font-tabular text-text-secondary">{formatMinutes(log.productiveMinutes)}</td>
                    <td className="py-2 pr-4 text-right font-mono font-tabular text-text-secondary">{formatMinutes(log.downtimeMinutes)}</td>
                    <td className="py-2 pr-4 text-right font-mono font-tabular text-text-secondary">{formatMinutes(log.changeoverMinutes)}</td>
                    <td className="py-2 pr-4 text-right">
                      {log.date === todayIso() ? (
                        <button type="button" onClick={() => startEdit(log)} className="font-sans text-xs text-accent-blue hover:underline">
                          Edit
                        </button>
                      ) : (
                        <span className="font-sans text-[11px] text-text-tertiary">Locked</span>
                      )}
                    </td>
                  </tr>
                ))}
              {recentState.status === 'ready' && recentState.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center font-sans text-xs text-text-secondary">
                    No entries in the last 7 days.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function shiftDate(dateIso: string, deltaDays: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
