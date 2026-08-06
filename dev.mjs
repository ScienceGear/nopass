import { spawn, spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const services = [
  { name: 'backend', args: ['--prefix', 'backend', 'run', 'dev'] },
  { name: 'frontend', args: ['--prefix', 'frontend', 'run', 'dev'] },
];

const children = services.map(({ name, args }) => {
  const child = spawn(npmCommand, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  child.on('error', (error) => {
    console.error(`Failed to start ${name}:`, error.message);
  });
  return child;
});

let stopping = false;
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

for (const child of children) {
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 1);
  });
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
