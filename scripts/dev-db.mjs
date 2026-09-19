#!/usr/bin/env node
/**
 * Webamazee AgentOS dev launcher (cross-platform).
 *
 * - If MONGODB_URI is set (MongoDB Atlas or other), runs the target directly.
 * - Otherwise uses/starts a local embedded MongoDB (mongodb-memory-server)
 *   listening on 127.0.0.1:27018 that PERSISTS data under .data/mongo.
 *   If one is already running (e.g. started by `npm run dev`), it is reused.
 *
 * Usage:
 *   node scripts/dev-db.mjs             → next dev + background worker
 *   node scripts/dev-db.mjs --mongo     → only the embedded MongoDB (stays up)
 *   node scripts/dev-db.mjs --worker    → worker process only
 *   node scripts/dev-db.mjs --seed      → seed database
 *   node scripts/dev-db.mjs --prod      → next start (production build) + background worker
 *
 * The worker is required: API routes enqueue jobs (Discovery workflow,
 * crawls, agent tasks); without a worker — or without Vercel Cron hitting
 * /api/jobs/process — the queue never drains and workflows stay "Running".
 *
 * Cross-platform note: targets are spawned as `node <local-binary>` using the
 * locally installed tsx/next entry points — no npx resolution and no shell,
 * so this works identically on Windows (PowerShell/CMD), macOS and Linux.
 */
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { spawn } from 'child_process';
import { connect } from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const HOST = '127.0.0.1';
const PORT = Number(process.env.AGENTOS_MONGO_PORT || 27018);
const URI = `mongodb://${HOST}:${PORT}/agentos`;

// Load .env.local if present
try {
  const envFile = readFileSync(path.join(root, '.env.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* none */ }

function portOpen(port, host) {
  return new Promise((resolve) => {
    const socket = connect({ port, host });
    socket.once('connect', () => { socket.end(); resolve(true); });
    socket.once('error', () => resolve(false));
    setTimeout(() => { socket.destroy(); resolve(false); }, 1500);
  });
}

async function startMemoryMongo() {
  if (await portOpen(PORT, HOST)) {
    console.log(`[agentos] reusing embedded MongoDB at ${URI}`);
    return null; // already running — not owned by this process, never stopped by us
  }
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const dbDir = path.join(root, '.data', 'mongo');
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
  const mongod = await MongoMemoryServer.create({
    instance: { dbPath: dbDir, storageEngine: 'wiredTiger', port: PORT, ip: HOST },
  });
  console.log(`[agentos] embedded MongoDB running at ${mongod.getUri('agentos')}`);
  return mongod;
}

/** Stop the embedded MongoDB only if THIS process started it. */
async function stopOwnedMongo(mongod) {
  if (!mongod) return;
  try {
    await mongod.stop({ doCleanup: true });
    console.log('[agentos] embedded MongoDB stopped');
  } catch (e) {
    console.warn('[agentos] warning: could not stop embedded MongoDB cleanly:', e.message);
  }
}

// Locally installed binaries — spawned directly via `node`, no npx, no shell.
const TSX_CLI = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const NEXT_BIN = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');

const WORKER_TARGET = { bin: TSX_CLI, label: 'tsx', rest: ['src/worker/index.ts'] };

function resolveTarget() {
  if (args.includes('--worker')) return WORKER_TARGET;
  if (args.includes('--seed')) return { bin: TSX_CLI, label: 'tsx', rest: ['scripts/run-seed.ts'] };
  if (args.includes('--prod')) return { bin: NEXT_BIN, label: 'next', rest: ['start', '-p', process.env.PORT || '3000', '-H', '0.0.0.0'] };
  return { bin: NEXT_BIN, label: 'next', rest: ['dev', '-p', process.env.PORT || '3000', '-H', '0.0.0.0'] };
}

/** The dev/prod launchers ALSO need the background worker: API routes only
 *  enqueue jobs (Discovery, crawls, agent tasks). Without a worker process
 *  (or the Vercel cron route hitting /api/jobs/process) the queue never
 *  drains and workflows stay "Running" forever. */
const launcherNeedsWorker = !args.includes('--worker') && !args.includes('--seed') && !args.includes('--mongo');

async function main() {
  let mongod = null;
  if (args.includes('--mongo')) {
    mongod = await startMemoryMongo();
    console.log('[agentos] MongoDB is up. Press Ctrl+C to stop.');
    const shutdown = async () => { await stopOwnedMongo(mongod); process.exit(0); };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    setInterval(() => {}, 60_000);
    return;
  }

  if (!process.env.MONGODB_URI) {
    mongod = await startMemoryMongo();
  }
  const uri = process.env.MONGODB_URI || URI;
  const env = { ...process.env, MONGODB_URI: uri };

  const target = resolveTarget();
  if (!existsSync(target.bin)) {
    console.error(`[agentos] ${target.label} binary not found at ${target.bin}`);
    console.error('[agentos] run `npm install` first.');
    await stopOwnedMongo(mongod);
    process.exit(1);
  }

  console.log(`[agentos] starting: node ${target.bin} ${target.rest.join(' ')}`);
  const spawner = (t) => spawn(process.execPath, [t.bin, ...t.rest], {
    env,
    stdio: 'inherit',
    cwd: root,
    shell: false, // safe: we spawn node itself, not a shell shim
  });
  const child = spawner(target);
  let worker = null;
  if (launcherNeedsWorker) {
    console.log(`[agentos] starting worker: node ${WORKER_TARGET.bin} ${WORKER_TARGET.rest.join(' ')}`);
    worker = spawner(WORKER_TARGET);
    worker.on('error', (err) => console.error('[agentos] worker failed to start:', err.message));
    worker.on('exit', (code) => {
      // Worker dying mid-run leaves jobs queued — crash loudly so the developer notices,
      // but don't silently take the web server down.
      console.error(`[agentos] worker exited (code ${code ?? 'signal'}) — background jobs will NOT process until it restarts. Relaunch or run: npm run worker`);
    });
  }

  let exited = false;
  const killAll = () => {
    for (const c of [child, worker]) { try { c?.kill('SIGTERM'); } catch { /* already dead */ } }
  };

  /** Always leave with the child exit code, and always stop an owned mongod. */
  const exitWith = async (code) => {
    if (exited) return;
    exited = true;
    killAll();
    await stopOwnedMongo(mongod);
    process.exit(code ?? 0);
  };

  child.on('error', (err) => {
    console.error('[agentos] failed to start target process:', err.message);
    void exitWith(1);
  });
  child.on('exit', (code, signal) => {
    void exitWith(code ?? (signal ? 1 : 0));
  });

  // Ctrl+C / SIGTERM (works on Windows PowerShell & CMD too): stop the children,
  // then stop the embedded MongoDB and exit with a clean status.
  const forward = () => {
    killAll();
    setTimeout(() => void exitWith(0), 2000); // safety if children ignore it
  };
  process.on('SIGINT', forward);
  process.on('SIGTERM', forward);
}

main().catch(async (e) => {
  console.error('[agentos] launcher error:', e);
  process.exit(1);
});
