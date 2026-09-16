import { useState } from 'react';
import type { AuthUser } from '../../data';
import { DailyLogForm } from './employeeWorkspace/DailyLogForm';
import { MyPerformance } from './employeeWorkspace/MyPerformance';
import { WorkforceOverview } from './managerWorkspace/WorkforceOverview';
import { DepartmentAnalysis } from './managerWorkspace/DepartmentAnalysis';
import { CauseBreakdown } from './managerWorkspace/CauseBreakdown';
import { EmployeeComparison } from './managerWorkspace/EmployeeComparison';
import { EmployeeProfile } from './managerWorkspace/EmployeeProfile';
import { GoalsFeedbackManager } from './managerWorkspace/GoalsFeedbackManager';
import { Alerts } from './managerWorkspace/Alerts';
import { DataQuality } from './managerWorkspace/DataQuality';
import { AuditLog } from './managerWorkspace/AuditLog';
import { Admin } from './managerWorkspace/Admin';

interface ManagerWorkspaceProps {
  user: AuthUser;
}

const ALL_TABS = [
  'Workforce Overview',
  'Daily Log',
  'My Performance',
  'Department Analysis',
  'Loss Causes',
  'Employee Comparison',
  'Employee Profile',
  'Goals & Feedback',
  'Alerts',
  'Data Quality',
  'Audit Log',
  'Admin',
] as const;
type Tab = (typeof ALL_TABS)[number];

function visibleTabs(role: AuthUser['role']): Tab[] {
  if (role === 'supervisor') {
    return ['Daily Log', 'My Performance', 'Department Analysis', 'Loss Causes', 'Employee Comparison', 'Employee Profile', 'Goals & Feedback', 'Alerts'];
  }
  if (role === 'manager') {
    return [
      'Workforce Overview',
      'Daily Log',
      'Department Analysis',
      'Loss Causes',
      'Employee Comparison',
      'Employee Profile',
      'Goals & Feedback',
      'Alerts',
      'Data Quality',
      'Audit Log',
    ];
  }
  // hr_admin sees every management tab, but not the supervisor-only "My Performance" self-view.
  return ALL_TABS.filter((t) => t !== 'My Performance');
}

export function ManagerWorkspace({ user }: ManagerWorkspaceProps) {
  const tabs = visibleTabs(user.role);
  const [tab, setTab] = useState<Tab>(user.role === 'supervisor' ? 'Department Analysis' : 'Workforce Overview');
  const [selectedDepartment, setSelectedDepartment] = useState(user.department);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  function goToDepartment(name: string) {
    setSelectedDepartment(name);
    setTab('Employee Comparison');
  }

  function goToEmployee(id: string) {
    setSelectedEmployeeId(id);
    setTab('Employee Profile');
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-sans text-2xl font-semibold text-text-primary">{user.name}</h2>
        <p className="mt-1 font-sans text-xs text-text-tertiary">
          {user.id} · {user.department} · {user.role === 'hr_admin' ? 'HR / Admin' : user.role[0].toUpperCase() + user.role.slice(1)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Manager workspace">
        {tabs.map((t) => {
          const isActive = t === tab;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(t)}
              className={`rounded-full border px-4 py-2 font-sans text-xs font-medium transition-colors ${
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

      {tab === 'Workforce Overview' && <WorkforceOverview onSelectDepartment={goToDepartment} />}
      {tab === 'Daily Log' && <DailyLogForm user={user} />}
      {tab === 'My Performance' && <MyPerformance user={user} />}
      {tab === 'Department Analysis' && <DepartmentAnalysis onSelectDepartment={goToDepartment} />}
      {tab === 'Loss Causes' && <CauseBreakdown />}
      {tab === 'Employee Comparison' && <EmployeeComparison departmentName={selectedDepartment} onSelectEmployee={goToEmployee} />}
      {tab === 'Employee Profile' &&
        (selectedEmployeeId ? (
          <EmployeeProfile employeeId={selectedEmployeeId} viewerRole={user.role} />
        ) : (
          <p className="font-sans text-sm text-text-secondary">Select an employee from Employee Comparison first.</p>
        ))}
      {tab === 'Goals & Feedback' && <GoalsFeedbackManager onSelectEmployee={goToEmployee} />}
      {tab === 'Alerts' && <Alerts onSelectEmployee={goToEmployee} />}
      {tab === 'Data Quality' && <DataQuality onSelectEmployee={goToEmployee} />}
      {tab === 'Audit Log' && <AuditLog />}
      {tab === 'Admin' && <Admin onSelectEmployee={goToEmployee} />}
    </div>
  );
}
