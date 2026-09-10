// Seeds the SQLite database from the placeholder employee roster in
// scenarios.json: departments, employees (with roles), demo login PINs, ~90
// days of daily-log history per employee, and a handful of sample goals/
// feedback so those screens aren't empty on first load. Safe to re-run: clears
// and re-inserts every table.
import { db } from './db.ts';
import scenarios from '../src/data/scenarios.json' with { type: 'json' };
import { hashPin } from './auth.ts';
import type { Role } from './auth.ts';

const { employeePortal } = scenarios;

// Roles are seeded onto the existing 27 placeholder employees, not invented new
// accounts (§ plan). Salman Sheikh is the sole Admin-department employee, a
// natural fit for HR/Admin. Two employees (one production, one support) become
// bakery-wide Managers. Everyone else who is the first-seeded employee in their
// department becomes that department's Supervisor; the rest stay Employee.
const HR_ADMIN_EMPLOYEE_ID = 'emp-25'; // Salman Sheikh, Admin
const MANAGER_EMPLOYEE_IDS = new Set(['emp-03', 'emp-23']); // Josef Santos (Bread Production), Ferdinand Aquino (Packing & Dispatch)

const HISTORY_DAYS = 90;
const WORK_DAY_PROBABILITY = 0.86; // ~6 days/week, deterministic per employee/day

function rnd(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

db.exec(
  `DELETE FROM feedback; DELETE FROM goals; DELETE FROM audit_log; DELETE FROM daily_logs;
   DELETE FROM sessions; DELETE FROM users; DELETE FROM employees; DELETE FROM departments;`,
);

const insertDepartment = db.prepare(
  'INSERT INTO departments (name, type, allocation_weight, allocation_basis_note) VALUES (?, ?, ?, ?)',
);
for (const dept of employeePortal.departments) {
  insertDepartment.run(dept.name, dept.type, dept.allocationWeight ?? null, dept.allocationBasisNote ?? null);
}

const firstEmployeeIdSeenInDept = new Map<string, string>();
for (const emp of employeePortal.employees) {
  if (!firstEmployeeIdSeenInDept.has(emp.department)) firstEmployeeIdSeenInDept.set(emp.department, emp.id);
}

function roleFor(employeeId: string, department: string): Role {
  if (employeeId === HR_ADMIN_EMPLOYEE_ID) return 'hr_admin';
  if (MANAGER_EMPLOYEE_IDS.has(employeeId)) return 'manager';
  if (firstEmployeeIdSeenInDept.get(department) === employeeId) return 'supervisor';
  return 'employee';
}

const insertEmployee = db.prepare('INSERT INTO employees (id, name, department, shift, role, active) VALUES (?, ?, ?, ?, ?, 1)');
const insertUser = db.prepare('INSERT INTO users (employee_id, pin_hash) VALUES (?, ?)');
const demoPins: { id: string; name: string; role: Role; pin: string }[] = [];

employeePortal.employees.forEach((emp, i) => {
  const role = roleFor(emp.id, emp.department);
  insertEmployee.run(emp.id, emp.name, emp.department, emp.shift, role);

  const pin = String(1001 + i);
  insertUser.run(emp.id, hashPin(pin));
  demoPins.push({ id: emp.id, name: emp.name, role, pin });
});

// --- Daily logs: ~90 trailing days per employee, deterministic pseudo-random
// variation around each employee's existing monthly baseline (scenarios.json),
// scaled to a daily figure. See plan: this is a disclosed simplification —
// support-department revenue no longer runs through the live
// computeAllocatedRevenue formula per day (that needs a per-day division-revenue
// anchor the monthly-era period_meta table used to provide); it's scaled
// proportionally from the same July baseline instead. computeAllocatedRevenue
// itself is unchanged and ready to be wired back in if a real daily revenue
// feed exists later.
const insertLog = db.prepare(`
  INSERT INTO daily_logs
    (employee_id, date, shift, paid_minutes, break_minutes, changeover_minutes, downtime_minutes, productive_minutes, units_produced, notes, loss_reason, daily_salary_cost, revenue_attributed, created_by_employee_id, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)
`);

const departmentByName = new Map(employeePortal.departments.map((d) => [d.name, d]));
const today = new Date();
today.setUTCHours(0, 0, 0, 0);

let totalLogs = 0;

employeePortal.employees.forEach((emp, employeeIndex) => {
  const dept = departmentByName.get(emp.department)!;
  const isProduction = dept.type === 'production';
  const dailySalaryBase = emp.totalSalaryCost / 22; // monthly baseline / ~working days in a month
  const dailyRevenueBase = emp.revenueAttributed / 22;

  for (let dayOffset = HISTORY_DAYS - 1; dayOffset >= 0; dayOffset--) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - dayOffset);
    const dateIso = isoDate(date);
    const seed = employeeIndex * 97.13 + dayOffset * 3.7;

    if (rnd(seed) > WORK_DAY_PROBABILITY) continue; // day off

    const paidMinutes = Math.round(510 + rnd(seed + 1) * 60); // 8.5h-9.5h
    const breakMinutes = 35;
    const changeoverMinutes = Math.round(20 + rnd(seed + 2) * 50);
    const downtimeMinutes = Math.round(5 + rnd(seed + 3) * 55);
    const idleMinutes = Math.round(5 + rnd(seed + 4) * 35);
    const productiveMinutes = Math.max(0, paidMinutes - breakMinutes - changeoverMinutes - downtimeMinutes - idleMinutes);

    const unitsProduced = isProduction ? Math.round((productiveMinutes / 60) * (18 + rnd(seed + 5) * 14)) : 0;
    const dailySalaryCost = round2(dailySalaryBase * (0.9 + rnd(seed + 6) * 0.2));
    const revenueAttributed = round2(dailyRevenueBase * (0.85 + rnd(seed + 7) * 0.3));

    insertLog.run(
      emp.id,
      dateIso,
      emp.shift,
      paidMinutes,
      breakMinutes,
      changeoverMinutes,
      downtimeMinutes,
      productiveMinutes,
      unitsProduced,
      dailySalaryCost,
      revenueAttributed,
      emp.id, // created_by = the employee themself for seeded history
      date.toISOString(),
      date.toISOString(),
    );
    totalLogs++;
  }
});

// --- A few sample goals and feedback, so those screens have something real to
// show on first login rather than an empty state.
const supervisorOrManager = employeePortal.employees.find((e) => MANAGER_EMPLOYEE_IDS.has(e.id))!;
const sampleTargets = employeePortal.employees.filter((e) => !MANAGER_EMPLOYEE_IDS.has(e.id) && e.id !== HR_ADMIN_EMPLOYEE_ID).slice(0, 4);

const insertGoal = db.prepare(`
  INSERT INTO goals (employee_id, title, metric, baseline, target, deadline, notes, status, created_by_employee_id, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const now = new Date().toISOString();
const deadlineIn = (days: number) => isoDate(new Date(today.getTime() + days * 86400000));

if (sampleTargets[0]) {
  insertGoal.run(
    sampleTargets[0].id,
    'Reduce average changeover time',
    'changeoverMinutes',
    45,
    35,
    deadlineIn(21),
    'Focus on tray-changeover sequencing during the morning shift.',
    'active',
    supervisorOrManager.id,
    now,
    now,
  );
}
if (sampleTargets[1]) {
  insertGoal.run(
    sampleTargets[1].id,
    'Improve True Efficiency to 90%',
    'trueEfficiencyPct',
    84,
    90,
    deadlineIn(5),
    null,
    'active',
    supervisorOrManager.id,
    now,
    now,
  );
}
if (sampleTargets[2]) {
  insertGoal.run(sampleTargets[2].id, 'Cut downtime after equipment PM', 'downtimeMinutes', 40, 25, deadlineIn(-3), null, 'overdue', supervisorOrManager.id, now, now);
}

const insertFeedback = db.prepare(`
  INSERT INTO feedback (employee_id, category, assessment, comment, follow_up_date, created_by_employee_id, created_at, acknowledged_at, employee_response)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

if (sampleTargets[0]) {
  insertFeedback.run(
    sampleTargets[0].id,
    'Changeover',
    'Needs improvement',
    'Changeover times have been trending above the department average this month. Let’s review the setup sequence together next week.',
    deadlineIn(7),
    supervisorOrManager.id,
    now,
    null,
    null,
  );
}
if (sampleTargets[1]) {
  insertFeedback.run(
    sampleTargets[1].id,
    'Recognition',
    'Strong performance',
    'Great consistency this period — true efficiency has stayed above the bakery average for three weeks running.',
    null,
    supervisorOrManager.id,
    now,
    now,
    'Thank you — appreciate the note!',
  );
}

const counts = {
  departments: (db.prepare('SELECT COUNT(*) AS n FROM departments').get() as { n: number }).n,
  employees: (db.prepare('SELECT COUNT(*) AS n FROM employees').get() as { n: number }).n,
  dailyLogs: (db.prepare('SELECT COUNT(*) AS n FROM daily_logs').get() as { n: number }).n,
  goals: (db.prepare('SELECT COUNT(*) AS n FROM goals').get() as { n: number }).n,
  feedback: (db.prepare('SELECT COUNT(*) AS n FROM feedback').get() as { n: number }).n,
};

console.log('Seeded:', counts, '(expected dailyLogs ~', totalLogs, ')');
console.log('\nRoles:');
for (const p of demoPins) {
  if (p.role !== 'employee') console.log(`  ${p.role.padEnd(10)} ${p.id}  ${p.name}`);
}
console.log('\nDemo login (Employee ID + 4-digit PIN):');
for (const p of demoPins) {
  console.log(`  ${p.id}  PIN ${p.pin}  ${p.name} (${p.role})`);
}
console.log('\nThese are placeholder demo PINs — replace with a real distribution/reset flow before real use.\n');

db.close();
