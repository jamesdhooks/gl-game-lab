import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startDemoServer, waitForServer } from './browser-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demo = path.join(root, 'packages', 'demo');
const output = path.join(root, 'docs', 'captures', 'particle');
const port = Number(process.env.GL_GAME_LAB_PARTICLE_CAPTURE_PORT ?? 5178);
const executablePath = process.env.GL_GAME_LAB_BROWSER_EXECUTABLE ?? findBrowserExecutable();
const patterns = ['peony', 'ring', 'chrysanthemum', 'willow', 'palm', 'spiral', 'crossette', 'comet'];
const captures = [
  ...['basic', 'enhanced', 'ultra'].map((renderStyle) => ({ id: `sparks-${renderStyle}`, experience: 'sparks', profile: 'play', frame: 180, scenario: 'weld', settings: { renderStyle } })),
  ...patterns.map((burstPattern) => ({ id: `fireworks-${burstPattern}`, experience: 'fireworks', profile: 'play', frame: 300, scenario: 'launch', settings: { renderStyle: 'ultra', burstPattern, shellFuse: 1.35 } })),
  { id: 'orbital-shrapnel-ultra', experience: 'orbital-shrapnel', profile: 'demo', frame: 240, settings: { renderStyle: 'ultra' } },
];

await mkdir(output, { recursive: true });
const server = startDemoServer({ demo, port });
let browser;
try {
  await waitForServer(`http://127.0.0.1:${port}/`);
  browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  for (const capture of captures) {
    process.stderr.write(`Capturing ${capture.id}\n`);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', (error) => { errors.push(error.message); });
    try {
      const query = new URLSearchParams({
        capture: '1', experience: capture.experience, profile: capture.profile,
        frame: String(capture.frame), delta: String(1 / 60), seed: '5366110',
        settings: JSON.stringify(capture.settings),
        ...(capture.scenario ? { scenario: capture.scenario } : {}),
      });
      await page.goto(`http://127.0.0.1:${port}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      const canvas = page.locator('canvas[data-engine-state="capture-ready"]');
      await canvas.waitFor({ state: 'visible', timeout: 120_000 });
      if (errors.length > 0) throw new Error(`${capture.id} reported page errors: ${errors.join(' | ')}`);
      await canvas.screenshot({ path: path.join(output, `${capture.id}.png`) });
    } finally { await page.close(); }
  }
  await context.close();
} finally {
  server.stop();
  await browser?.close().catch(() => undefined);
}

function findBrowserExecutable() {
  const candidates = process.platform === 'win32'
    ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('Set GL_GAME_LAB_BROWSER_EXECUTABLE to a Chromium-compatible browser');
  return found;
}
