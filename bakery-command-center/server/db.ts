import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Defaults to today's local path (server/data/) so nothing changes for local
// dev or the single-machine desktop deployment — but on a host with an
// ephemeral container filesystem (Render or similar), DB_DIR should point at
// a mounted persistent-disk directory instead, or every restart/redeploy
// silently wipes employees, sessions, and saved settings.
const DATA_DIR = process.env.DB_DIR ?? path.join(__dirname, 'data');
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

// Data Processor (migration Phase 7). app_settings holds the Anthropic API key
// and SMTP credentials someone enters once via the Settings page — write-only
// from the frontend's perspective (server/services/settings.ts never returns
// a stored value, only whether one exists). Deliberately the same file as
// every employee record and PIN hash, not a second file to track separately —
// see the migration report for what that couples to for handover.
db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS data_processor_uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    uploaded_by_employee_id TEXT NOT NULL REFERENCES employees(id),
    uploaded_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('interpreted', 'confirmed')) DEFAULT 'interpreted',
    confirmed_at TEXT,
    detected_data_type TEXT,
    summary TEXT,
    result_json TEXT
  );
`);

// AI Risk Intelligence (Scenario & Resilience, 5th module). A row is written
// to ai_research only on a genuine successful OpenAI call — same "no partial
// rows on failure" rule as data_processor_uploads. params_hash is the cache
// key (question + horizon + risk type + material + depth + geography,
// canonicalized); cited_sources_json/all_sources_json are populated only from
// the OpenAI response's own annotation/action.sources fields, never composed
// by this app. user_assumptions_json is written only once a saved research
// record's Prepare-stage values are edited, so AI-suggested vs. user-edited
// stays auditable. ai_usage exists purely for the monthly cap and per-user
// rate limit — one row per actual OpenAI call, never per cache hit.
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_research (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    params_json TEXT NOT NULL,
    params_hash TEXT NOT NULL,
    result_json TEXT NOT NULL,
    cited_sources_json TEXT NOT NULL,
    all_sources_json TEXT NOT NULL,
    user_assumptions_json TEXT,
    created_by_employee_id TEXT NOT NULL REFERENCES employees(id),
    created_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('completed')) DEFAULT 'completed'
  );

  CREATE INDEX IF NOT EXISTS idx_ai_research_params_hash ON ai_research(params_hash);

  CREATE TABLE IF NOT EXISTS ai_watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    risk TEXT NOT NULL,
    raw_material TEXT,
    geography TEXT,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'moderate', 'high')),
    key_indicator TEXT,
    last_researched_at TEXT,
    review_date TEXT,
    created_by_employee_id TEXT NOT NULL REFERENCES employees(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    searched_at TEXT NOT NULL,
    depth TEXT NOT NULL CHECK (depth IN ('quick', 'standard', 'detailed')),
    estimated_searches INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_ai_usage_employee ON ai_usage(employee_id, searched_at);
`);

export { DB_PATH };
