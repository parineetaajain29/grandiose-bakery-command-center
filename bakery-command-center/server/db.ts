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

export { DB_PATH };
