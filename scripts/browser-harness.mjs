import { spawn } from 'node:child_process';
import path from 'node:path';

export function startDemoServer({ demo, port, mode = 'dev' }) {
  const vite = path.join(demo, 'node_modules', 'vite', 'bin', 'vite.js');
  const args = [vite, ...(mode === 'preview' ? ['preview'] : []), '--host', '127.0.0.1', '--port', String(port), '--strictPort'];
  const child = spawn(process.execPath, args, {
    cwd: demo,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let outputText = '';
  child.stdout.on('data', (chunk) => { outputText += chunk.toString(); });
  child.stderr.on('data', (chunk) => { outputText += chunk.toString(); });
  child.once('exit', (code) => {
    if (code && code !== 0) process.stderr.write(`Vite ${mode} exited ${code}:\n${outputText}\n`);
  });
  return {
    stop() {
      if (child.killed) return;
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).unref();
      } else child.kill('SIGTERM');
    },
  };
}

export async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch { /* server is starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
