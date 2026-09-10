import { useAuth } from '../../data/api';
import { LoginScreen } from './LoginScreen';
import { EmployeeWorkspace } from './EmployeeWorkspace';
import { ManagerWorkspace } from './ManagerWorkspace';

/**
 * The Employee Portal's entry point (§1). Nothing else in the portal renders
 * until a successful login — no data is even fetched before that (useAuth only
 * hits GET /api/auth/me, which returns 401/no-body when logged out).
 */
export function EmployeePortalGate() {
  const { auth, doLogin, doLogout } = useAuth();

  if (auth.status === 'loading') {
    return (
      <section className="rounded-xl border border-border-subtle bg-bg-panel p-8 text-center">
        <p className="font-mono text-sm text-text-secondary">Checking login…</p>
      </section>
    );
  }

  if (auth.status === 'anonymous') {
    return <LoginScreen onLogin={doLogin} />;
  }

  const { user } = auth;
  // Supervisors get the manager-shaped workspace too — department comparison,
  // goals, and feedback tools, not just the individual dashboard — but every
  // section stays scoped to their own department server-side (rbac.ts), and
  // bakery-wide/HR-only sections are hidden for them inside ManagerWorkspace.
  if (user.role === 'manager' || user.role === 'hr_admin' || user.role === 'supervisor') {
    return <ManagerWorkspace user={user} onLogout={doLogout} />;
  }
  return <EmployeeWorkspace user={user} onLogout={doLogout} />;
}
