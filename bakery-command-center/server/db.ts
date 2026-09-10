import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'bakery.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

// labour_logs/period_meta (monthly-grain, pre-role-based-access) are retired in
// favour of daily_logs — the shape changed fundamentally (daily rows, minutes
// instead of derived hours), so this is a clean drop + reseed rather than a
// column migration. All data behind them was placeholder/demo.
db.exec('DROP TABLE IF EXISTS labour_logs; DROP TABLE IF EXISTS period_meta;');

db.exec(`
  CREATE TABLE IF NOT EXISTS departments (
    name TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('production', 'support')),
    allocation_weight REAL,
    allocation_basis_note TEXT
  );

  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    department TEXT NOT NULL REFERENCES departments(name),
    shift TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    employee_id TEXT PRIMARY KEY REFERENCES employees(id),
    pin_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS daily_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    date TEXT NOT NULL,
    shift TEXT NOT NULL,
    paid_minutes REAL NOT NULL,
    break_minutes REAL NOT NULL,
    changeover_minutes REAL NOT NULL,
    downtime_minutes REAL NOT NULL,
    productive_minutes REAL NOT NULL,
    units_produced REAL,
    notes TEXT,
    loss_reason TEXT,
    daily_salary_cost REAL NOT NULL DEFAULT 0,
    revenue_attributed REAL NOT NULL DEFAULT 0,
    created_by_employee_id TEXT NOT NULL REFERENCES employees(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (employee_id, date, shift)
  );

  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    title TEXT NOT NULL,
    metric TEXT,
    baseline REAL,
    target REAL,
    deadline TEXT,
    notes TEXT,
    status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'overdue', 'cancelled')) DEFAULT 'active',
    created_by_employee_id TEXT NOT NULL REFERENCES employees(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    category TEXT NOT NULL,
    assessment TEXT,
    comment TEXT NOT NULL,
    follow_up_date TEXT,
    created_by_employee_id TEXT NOT NULL REFERENCES employees(id),
    created_at TEXT NOT NULL,
    acknowledged_at TEXT,
    employee_response TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    actor_employee_id TEXT REFERENCES employees(id),
    actor_role TEXT,
    action TEXT NOT NULL,
    affected_employee_id TEXT REFERENCES employees(id),
    details TEXT
  );
`);

// Guarded migrations for tables that already existed on disk from earlier phases
// this session — CREATE TABLE IF NOT EXISTS only handles brand-new tables.
function addColumnIfMissing(table: string, column: string, ddl: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

addColumnIfMissing('employees', 'role', "role TEXT NOT NULL DEFAULT 'employee'");
addColumnIfMissing('employees', 'active', 'active INTEGER NOT NULL DEFAULT 1');
addColumnIfMissing('users', 'failed_attempts', 'failed_attempts INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('users', 'locked_until', 'locked_until TEXT');

// Daily Log data-integrity pass: idle/other is now a genuine reported field (productive
// minutes is derived from it server-side, never accepted as input — see
// src/lib/labourCalc.ts's deriveProductiveMinutes); downtime/changeover gain required
// cause codes; a shift now carries an activity type so a non-production shift (cleaning,
// training) can be exempted from requiring units produced.
addColumnIfMissing('daily_logs', 'idle_minutes', 'idle_minutes REAL');
addColumnIfMissing('daily_logs', 'downtime_cause_code', 'downtime_cause_code TEXT');
addColumnIfMissing('daily_logs', 'changeover_cause_code', 'changeover_cause_code TEXT');
// DEFAULT 'production' both satisfies SQLite's NOT NULL-with-existing-rows requirement
// and is the semantically correct backfill — every row written before this column
// existed really was a production shift.
addColumnIfMissing('daily_logs', 'activity_type', "activity_type TEXT NOT NULL DEFAULT 'production'");
// Provenance flag: 0 for every row saved going forward (productive_minutes is always
// server-derived now — see deriveProductiveMinutes). Set to 1 below, only for rows that
// predate idle tracking, whose productive_minutes was still self-reported. This is what
// lets the trend chart mark which points carry that weaker guarantee (see
// server/services/metrics.ts's hasLegacyData) — the True Efficiency/Performance While
// Working *numbers* for those rows are unaffected (they never read idleMinutes), but the
// underlying productive figure for them was typed directly, not derived.
addColumnIfMissing('daily_logs', 'productive_self_reported', 'productive_self_reported INTEGER NOT NULL DEFAULT 0');

// One-time, idempotent backfill for idle_minutes (and the provenance flag above) on rows
// written before this column existed: fills in the exact residual the new invariant
// (paid = break + changeover + downtime + idle + productive) implies, using each row's
// own already-stored productive_minutes. Never touches productive_minutes/downtime/
// changeover on any existing row, so True Efficiency, Performance While Working, and
// every existing trend stay numerically unchanged — this only fills the new fields for
// continuity, it does not re-derive or re-verify the historical productive figure. Runs
// on every boot but is a no-op once done (WHERE idle_minutes IS NULL), same guarded
// pattern as the ALTERs above. downtime_cause_code/changeover_cause_code are deliberately
// left NULL for these rows — there is no source data to reconstruct a real cause from;
// the manager cause-breakdown view buckets them as "not recorded" rather than guessing.
db.exec(`
  UPDATE daily_logs
  SET idle_minutes = paid_minutes - break_minutes - changeover_minutes - downtime_minutes - productive_minutes,
      productive_self_reported = 1
  WHERE idle_minutes IS NULL
`);

export { DB_PATH };
