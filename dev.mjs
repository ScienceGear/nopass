import { existsSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import net from 'node:net';
import { lookup } from 'node:dns/promises';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const services = [
  { name: 'backend', args: ['--prefix', 'backend', 'run', 'dev'] },
  { name: 'frontend', args: ['--prefix', 'frontend', 'run', 'dev'] },
];
const postgresBin = 'C:\\Program Files\\PostgreSQL\\17\\bin';
const postgresData = join(process.cwd(), 'backend', '.postgres-data');
const postgresLog = join(postgresData, 'postgres.log');

let children = [];
let stopping = false;

function spawnProcess(command, args, options) {
  if (process.platform === 'win32' && !command.endsWith('.exe')) {
    return spawn('cmd.exe', ['/d', '/s', '/c', command, ...args], options);
  }
  return spawn(command, args, options);
}

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawnProcess(command, args, { stdio: 'inherit' });
    child.once('error', (error) => {
      console.error(`Failed to run ${command}:`, error.message);
      resolve(1);
    });
    child.once('exit', (code) => resolve(code ?? 1));
  });
}

function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function ensurePostgres() {
  if (await portIsOpen(5432)) return;

  const initdb = join(postgresBin, 'initdb.exe');
  const pgCtl = join(postgresBin, 'pg_ctl.exe');
  const createdb = join(postgresBin, 'createdb.exe');
  if (!existsSync(initdb) || !existsSync(pgCtl)) {
    throw new Error('PostgreSQL 17 was not found. Install PostgreSQL or Docker Desktop, then run npm run dev again.');
  }

  if (!existsSync(join(postgresData, 'PG_VERSION'))) {
    const initCode = await run(initdb, ['-D', postgresData, '-U', 'postgres', '--auth=trust']);
    if (initCode !== 0) throw new Error('Could not initialize the local PostgreSQL data directory.');
  }

  const startCode = await run(pgCtl, ['start', '-D', postgresData, '-l', postgresLog, '-o', '-p 5432', '-w']);
  if (startCode !== 0 || !(await portIsOpen(5432))) {
    throw new Error(`Could not start PostgreSQL. See ${postgresLog} for details.`);
  }

  // A non-zero result means the database already exists, which is harmless.
  await run(createdb, ['-U', 'postgres', 'novabank']);
}

function usesLocalDatabase() {
  const envFile = readFileSync(join(process.cwd(), 'backend', '.env'), 'utf8');
  const line = envFile.split(/\r?\n/).find((value) => value.startsWith('DATABASE_URL='));
  if (!line) return true;
  const databaseUrl = line.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
  return databaseUrl.includes('@localhost:') || databaseUrl.includes('@127.0.0.1:');
}

async function verifyRemoteDatabaseHost() {
  const envFile = readFileSync(join(process.cwd(), 'backend', '.env'), 'utf8');
  const line = envFile.split(/\r?\n/).find((value) => value.startsWith('DATABASE_URL='));
  const databaseUrl = line?.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
  if (!databaseUrl) throw new Error('DATABASE_URL is missing from backend/.env.');
  const host = new URL(databaseUrl).hostname;
  try {
    await lookup(host);
  } catch {
    throw new Error(`Database host "${host}" could not be resolved. Copy the current Service URI from your database provider into backend/.env.`);
  }
}

function startServices() {
  children = services.map(({ name, args }) => {
    const child = spawnProcess(npmCommand, args, { stdio: 'inherit' });
    child.on('error', (error) => console.error(`Failed to start ${name}:`, error.message));
    child.on('exit', (code) => {
      if (!stopping) stop(code ?? 1);
    });
    return child;
  });
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      child.kill();
    }
  }
  process.exit(exitCode);
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

try {
  if (usesLocalDatabase()) {
    await ensurePostgres();
  } else {
    await verifyRemoteDatabaseHost();
  }
  const migrationCode = await run(npmCommand, ['--prefix', 'backend', 'run', 'db:deploy']);
  if (migrationCode !== 0) throw new Error('Could not apply database migrations.');
  startServices();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
