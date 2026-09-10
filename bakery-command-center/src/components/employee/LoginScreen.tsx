import { useState } from 'react';

interface LoginScreenProps {
  onLogin: (employeeId: string, pin: string) => Promise<void>;
}

/**
 * The first screen the Employee Portal shows, full stop — no KPI, no chart, no
 * employee list, nothing renders before a successful login (§1). Employee ID is
 * a free-text field rather than a name picker deliberately: listing all 27
 * names on an unauthenticated screen is itself a small piece of workforce
 * information this build doesn't need to expose before login.
 */
export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId.trim()) {
      setError('Employee ID is required.');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setError('PIN must be 4 digits.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onLogin(employeeId.trim(), pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    'mt-1.5 w-full rounded-lg border border-border-subtle bg-bg-primary px-3.5 py-2.5 font-mono text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none';
  const labelClass = 'font-mono text-[11px] tracking-[0.14em] text-text-secondary';

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-border-subtle bg-bg-panel p-8">
        <p className="font-mono text-xs tracking-[0.18em] text-text-secondary">GRANDIOSE BAKERY</p>
        <h1 className="mt-2 font-sans text-2xl font-semibold text-text-primary">Employee Performance Portal</h1>

        <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
          <div>
            <label className={labelClass} htmlFor="login-employee-id">
              EMPLOYEE ID
            </label>
            <input
              id="login-employee-id"
              type="text"
              autoComplete="username"
              placeholder="e.g. emp-01"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="login-pin">
              PIN
            </label>
            <input
              id="login-pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={4}
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className={`${inputClass} tracking-[0.4em]`}
            />
          </div>

          {error && <p className="font-mono text-xs text-accent-red">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 rounded-lg border border-accent-blue bg-accent-blue px-4 py-2.5 font-mono text-sm font-semibold tracking-wide text-[#04070d] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Logging in…' : 'Login'}
          </button>
        </form>

        <p className="mt-6 text-center font-mono text-[11px] text-text-secondary">Contact HR if you need your PIN reset.</p>
      </div>
    </div>
  );
}
