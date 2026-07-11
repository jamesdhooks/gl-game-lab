import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startDemoServer, waitForServer } from './browser-harness.mjs';
import { RELEASE_EXPERIENCE_IDS } from './release-catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demo = path.join(root, 'packages', 'demo');
const output = path.resolve(process.env.GL_GAME_LAB_PERFORMANCE_OUTPUT ?? path.join(root, '.artifacts', 'performance'));
const port = Number(process.env.GL_GAME_LAB_PERFORMANCE_PORT ?? 5176);
const executablePath = process.env.GL_GAME_LAB_BROWSER_EXECUTABLE ?? findBrowserExecutable();
const requestedTier = argument('tier');
const requestedExperience = argument('experience');
const enforce = process.argv.includes('--enforce');
const experiences = RELEASE_EXPERIENCE_IDS;
const tiers = Object.freeze({
  desktop: { viewport: { width: 1280, height: 720 }, frames: 180, delta: 1 / 60, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, frames: 120, delta: 1 / 30, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
});

if (requestedTier && !(requestedTier in tiers)) throw new Error(`Unknown performance tier: ${requestedTier}`);
if (requestedExperience && !experiences.includes(requestedExperience)) throw new Error(`Unknown experience: ${requestedExperience}`);

await mkdir(output, { recursive: true });
const server = startDemoServer({ demo, port });
let browser;
try {
  await waitForServer(`http://127.0.0.1:${port}/`);
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  const results = [];
  for (const tier of requestedTier ? [requestedTier] : Object.keys(tiers)) {
    for (const experience of requestedExperience ? [requestedExperience] : experiences) {
      process.stderr.write(`Profiling ${experience} (${tier})\n`);
      results.push(await capture(browser, tier, experience));
    }
  }
  const report = Object.freeze({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runtime: { platform: process.platform, architecture: process.arch, node: process.version, browser: executablePath },
    policy: 'desktop 60 FPS and mobile 30 FPS at default demo settings; maximum settings are stress mode',
    results,
    passed: results.every((result) => result.passed),
  });
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (enforce && !report.passed) process.exitCode = 2;
} finally {
  server.stop();
  await browser?.close().catch(() => undefined);
}

async function capture(activeBrowser, tier, experience) {
  const config = tiers[tier];
  const context = await activeBrowser.newContext(config);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => { errors.push(error.message); });
  const query = new URLSearchParams({
    capture: '1', experience, frame: String(config.frames), delta: String(config.delta),
    profile: 'demo', seed: '5366110',
  });
  const url = `http://127.0.0.1:${port}/?${query}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const canvas = page.locator('canvas[data-engine-state="capture-ready"]');
    await canvas.waitFor({ state: 'visible', timeout: 120_000 });
    const metadata = await canvas.evaluate((element, activeTier) => ({
      cpuP95Ms: Number(element.dataset.captureCpuP95),
      checksum: element.dataset.captureChecksum,
      drawCalls: Number(element.dataset.captureDrawCalls),
      uploadBytes: Number(element.dataset.captureUploadBytes),
      gpuBytes: Number(element.dataset.captureGpuBytes),
      budgetPassed: element.dataset[activeTier === 'desktop' ? 'captureDesktopBudget' : 'captureMobileBudget'] === 'true',
      diagnostics: JSON.parse(element.dataset.captureDiagnostics ?? '{}'),
    }), tier);
    return Object.freeze({ tier, experience, url, ...metadata, errors, passed: metadata.budgetPassed && errors.length === 0 });
  } finally {
    await context.close();
  }
}

function argument(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function findBrowserExecutable() {
  const candidates = process.platform === 'win32'
    ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('Set GL_GAME_LAB_BROWSER_EXECUTABLE to a Chromium-compatible browser');
  return found;
}
