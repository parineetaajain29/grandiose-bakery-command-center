import type { AuthUser } from '../../data';
import { EmployeeWorkspace } from './EmployeeWorkspace';
import { ManagerWorkspace } from './ManagerWorkspace';

interface EmployeePortalGateProps {
  user: AuthUser;
  onLogout: () => void;
}

/**
 * Role branch only — the login wall itself now lives once, at the top of
 * App.tsx, not here. This component receives an already-authenticated user;
 * its job is purely deciding which workspace shape that role gets.
 * Supervisors get the manager-shaped workspace too — department comparison,
 * goals, and feedback tools, not just the individual dashboard — but every
 * section stays scoped to their own department server-side (rbac.ts), and
 * bakery-wide/HR-only sections are hidden for them inside ManagerWorkspace.
 */
export function EmployeePortalGate({ user, onLogout }: EmployeePortalGateProps) {
  if (user.role === 'manager' || user.role === 'hr_admin' || user.role === 'supervisor') {
    return <ManagerWorkspace user={user} onLogout={onLogout} />;
  }
  return <EmployeeWorkspace user={user} onLogout={onLogout} />;
}
