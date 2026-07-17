import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startDemoServer, waitForServer } from './browser-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demo = path.join(root, 'packages', 'demo');
const output = path.join(root, 'docs', 'benchmarks', 'particle');
const port = Number(process.env.GL_GAME_LAB_PARTICLE_BENCHMARK_PORT ?? 5177);
const executablePath = process.env.GL_GAME_LAB_BROWSER_EXECUTABLE ?? findBrowserExecutable();
const effects = ['sparks', 'fireworks', 'orbital'];
const capacities = [65_536, 147_456, 262_144, 589_824];
const tiers = ['basic', 'enhanced', 'ultra'];
const gateOnly = process.argv.includes('--gates');
const workloads = gateOnly
  ? effects.flatMap((effect) => [
      { effect, capacity: 65_536, tier: 'ultra' },
      { effect, capacity: 147_456, tier: 'ultra' },
      { effect, capacity: 262_144, tier: 'enhanced' },
      { effect, capacity: 589_824, tier: 'basic' },
    ])
  : effects.flatMap((effect) => capacities.flatMap((capacity) => tiers.map((tier) => ({ effect, capacity, tier }))));

const server = startDemoServer({ demo, port });
let browser;
try {
  await waitForServer(`http://127.0.0.1:${port}/`);
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const results = [];
  for (const workload of workloads) {
    process.stderr.write(`Benchmarking ${workload.effect} ${workload.capacity} ${workload.tier}\n`);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', (error) => { errors.push(error.message); });
    try {
      const query = new URLSearchParams({ particleBenchmark: '1', effect: workload.effect, capacity: String(workload.capacity), tier: workload.tier });
      await page.goto(`http://127.0.0.1:${port}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      const run = page.getByRole('button', { name: 'Run 5s benchmark' });
      await run.waitFor({ state: 'visible', timeout: 120_000 });
      await run.click();
      const reportElement = page.getByTestId('particle-benchmark-report');
      await reportElement.waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector('[data-testid="particle-benchmark-report"]')?.textContent?.trim().startsWith('{'), undefined, { timeout: 30_000 });
      const report = JSON.parse(await reportElement.textContent());
      await page.getByRole('button', { name: 'Save report' }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('p')].some((entry) => entry.textContent?.startsWith('Saved docs/benchmarks/particle/')), undefined, { timeout: 10_000 });
      results.push({ ...report, pageErrors: errors, gate: evaluateGate(report) });
    } finally {
      await page.close();
    }
  }
  await context.close();
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    browser: executablePath,
    mode: gateOnly ? 'release-gates' : 'full-matrix',
    results,
    passed: results.every((entry) => entry.pageErrors.length === 0 && entry.gate.passed),
  };
  await writeFile(path.join(output, `${new Date().toISOString().slice(0, 10)}-matrix-${gateOnly ? 'gates' : 'full'}.json`), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ workloads: results.length, errors: results.reduce((sum, entry) => sum + entry.pageErrors.length, 0) })}\n`);
} finally {
  server.stop();
  await browser?.close().catch(() => undefined);
}

function evaluateGate(report) {
  const { capacity, tier } = report.configuration;
  const budget = capacity === 65_536 && tier === 'ultra' ? { fps: 60, gpuP95: 8 }
    : capacity === 147_456 && tier === 'ultra' ? { fps: 60, gpuP95: 12 }
      : capacity === 262_144 && tier === 'enhanced' ? { fps: 55, gpuP95: 15 }
        : capacity === 589_824 && tier === 'basic' ? { fps: 45, gpuP95: 20 }
          : { fps: 0, gpuP95: Number.POSITIVE_INFINITY };
  const gpuPass = !report.gpuMs.available || report.gpuMs.p95 < budget.gpuP95;
  return {
    budget,
    fpsPass: report.fps.average >= budget.fps,
    gpuPass,
    passed: report.fps.average >= budget.fps && gpuPass,
  };
}

function findBrowserExecutable() {
  const candidates = process.platform === 'win32'
    ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('Set GL_GAME_LAB_BROWSER_EXECUTABLE to a Chromium-compatible browser');
  return found;
}
