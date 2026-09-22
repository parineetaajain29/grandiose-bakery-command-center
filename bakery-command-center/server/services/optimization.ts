// Node-to-Python subprocess integration for the production-mix optimization
// engine (optimization_engine.py, at the repo root, sibling to this app —
// never modified by this integration). optimization_cli.py is a thin JSON
// stdin/stdout wrapper around optimize_production(); this module owns the
// subprocess mechanics only, mirroring anthropicInterpreter.ts's
// "not configured" + outcome-object shape used elsewhere in this codebase.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// This app always runs from source via `tsx` in both dev and "production"
// (single-process desktop deployment — see server/index.ts), so __dirname
// reliably resolves to .../bakery-command-center/server/services in both
// modes, making this relative resolution portable rather than machine-specific.
const REPO_ROOT = path.resolve(__dirname, '../../../');
const PYTHON_BIN = process.env.OPTIMIZATION_PYTHON ?? path.join(REPO_ROOT, '.venv', 'bin', 'python');
const CLI_SCRIPT = path.join(REPO_ROOT, 'optimization_cli.py');
const TIMEOUT_MS = 15_000;

export interface OptimizationRequestBody {
  sku_data?: unknown;
  resource_limits?: unknown;
  scenario?: unknown;
}

export type OptimizationOutcome =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; reason: 'invalid_input'; message: string }
  | { ok: false; reason: 'process_failure'; message: string };

function runCli(payload: OptimizationRequestBody): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [CLI_SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error('optimization engine timed out'));
    }, TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`optimization engine exited with code ${code}: ${stderr.slice(0, 2000)}`));
        return;
      }
      resolve({ stdout });
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

export async function runOptimization(body: OptimizationRequestBody): Promise<OptimizationOutcome> {
  let stdout: string;
  try {
    ({ stdout } = await runCli(body));
  } catch (err) {
    console.error('[optimization] subprocess failure:', err);
    return { ok: false, reason: 'process_failure', message: 'Optimization engine unavailable. Please try again.' };
  }

  let parsed: { ok: boolean; result?: Record<string, unknown>; error?: { message: string } };
  try {
    parsed = JSON.parse(stdout);
  } catch {
    console.error('[optimization] non-JSON output from subprocess:', stdout.slice(0, 2000));
    return { ok: false, reason: 'process_failure', message: 'Optimization engine returned an unreadable response.' };
  }

  if (!parsed.ok) {
    return { ok: false, reason: 'invalid_input', message: parsed.error?.message ?? 'Invalid optimization input.' };
  }
  return { ok: true, result: parsed.result ?? {} };
}
