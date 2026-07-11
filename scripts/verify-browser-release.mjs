import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright-core';
import { startDemoServer, waitForServer } from './browser-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demo = path.join(root, 'packages', 'demo');
const output = path.resolve(process.env.GL_GAME_LAB_BROWSER_OUTPUT ?? path.join(root, '.artifacts', 'browser-release'));
const port = Number(process.env.GL_GAME_LAB_BROWSER_PORT ?? 5177);
const requested = argument('browser');
const browserTypes = { chromium, firefox, webkit };
if (requested && !(requested in browserTypes)) throw new Error(`Unknown browser: ${requested}`);
const selected = requested ? [requested] : Object.keys(browserTypes);

await mkdir(output, { recursive: true });
const server = startDemoServer({ demo, port, mode: 'preview' });
const results = [];
try {
  await waitForServer(`http://127.0.0.1:${port}/`);
  for (const browserName of selected) {
    process.stderr.write(`Verifying ${browserName}\n`);
    results.push(await verifyBrowser(browserName, browserTypes[browserName]));
  }
} finally {
  server.stop();
}

const report = Object.freeze({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  results,
  passed: results.every((result) => result.passed),
});
await writeFile(path.join(output, `report-${requested ?? 'all'}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 2;

async function verifyBrowser(browserName, browserType) {
  const failures = [];
  try {
    const functionalBrowser = await browserType.launch(browserLaunchOptions(browserName));
    const functional = await verifyFunctional(functionalBrowser, failures)
      .finally(async () => { await functionalBrowser.close(); });
    const contextBrowser = await browserType.launch(browserLaunchOptions(browserName));
    const context = await verifyContextRecovery(contextBrowser, failures)
      .finally(async () => { await contextBrowser.close(); });
    return Object.freeze({ browser: browserName, functional, context, failures, passed: failures.length === 0 });
  } catch (error) {
    failures.push(describe(error));
    return Object.freeze({ browser: browserName, failures, passed: false });
  }
}

function browserLaunchOptions(browserName) {
  if (browserName !== 'firefox') return { headless: true };
  return {
    headless: false,
    firefoxUserPrefs: {
      'webgl.disabled': false,
      'webgl.enable-webgl2': true,
      'webgl.forbid-software': false,
      'webgl.force-enabled': true,
    },
  };
}

async function verifyFunctional(browser, failures) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await context.addInitScript(() => {
    const gamepad = {
      index: 0, id: 'GLGameLab CI Gamepad', connected: true, mapping: 'standard', timestamp: 1,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [gamepad] });
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => { pageErrors.push(error.message); });
  try {
    await page.goto(url({ experience: 'reference-arena', lifecycleTest: '1', inputTest: '1' }), { waitUntil: 'domcontentloaded' });
    const canvas = page.locator('canvas[data-engine-state="running"]');
    await canvas.waitFor({ state: 'visible', timeout: 60_000 });
    const liveStatus = page.getByRole('status').filter({ hasText: /Reference Arena score/ });
    if (await liveStatus.count() !== 1) failures.push('Reference Arena accessibility live score was not exposed');
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('Reference Arena canvas has no touchable bounds');
    await page.touchscreen.tap(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);
    await page.waitForTimeout(100);
    await page.getByRole('button', { name: 'Report input state' }).click();
    const controls = page.locator('[aria-label="Engine diagnostic controls"]');
    const gamepadCount = Number(await controls.getAttribute('data-input-gamepads'));
    const pointerEvents = Number(await controls.getAttribute('data-input-pointer-events'));
    if (gamepadCount !== 1) failures.push(`Expected one polled gamepad, received ${gamepadCount}`);
    if (pointerEvents < 2) failures.push(`Expected touch down/up events, received ${pointerEvents}`);
    await page.getByRole('button', { name: 'Replace experience' }).click();
    await page.locator('[data-diagnostic-status="lifecycle-passed"]').waitFor({ state: 'visible', timeout: 60_000 });
    await page.locator('[data-experience-id="ball-pit"] canvas[data-engine-state="running"]').waitFor({ state: 'visible', timeout: 60_000 });
    failures.push(...pageErrors.map((message) => `Functional page error: ${message}`));
    return Object.freeze({ accessibility: true, touch: pointerEvents >= 2, pointerEvents, gamepadCount, lifecycle: true });
  } finally {
    await context.close();
  }
}

async function verifyContextRecovery(browser, failures) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => { pageErrors.push(error.message); });
  try {
    const contextStrategy = process.env.GL_GAME_LAB_CONTEXT_STRATEGY ?? 'driver';
    await page.goto(url({ experience: 'reference-arena', contextTest: '1', contextStrategy }), { waitUntil: 'domcontentloaded' });
    await page.locator('canvas[data-engine-state="running"]').waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByRole('button', { name: 'Cycle GPU context' }).click();
    const controls = page.locator('[aria-label="Engine diagnostic controls"]');
    await page.waitForFunction(() => {
      const status = document.querySelector('[aria-label="Engine diagnostic controls"]')?.getAttribute('data-diagnostic-status');
      return status === 'context-passed' || status === 'context-failed' || status === 'context-error';
    }, undefined, { timeout: 20_000 });
    const status = await controls.getAttribute('data-diagnostic-status');
    if (status !== 'context-passed') {
      const runtimeError = await page.getByRole('alert').textContent().catch(() => undefined);
      throw new Error(`Context cycle ended with ${status ?? 'missing status'}${runtimeError ? `: ${runtimeError}` : ''}`);
    }
    const values = await controls.evaluate((element) => ({
      strategy: element.dataset.contextStrategy,
      generationBefore: Number(element.dataset.contextGenerationBefore),
      generationAfter: Number(element.dataset.contextGenerationAfter),
      resourcesBefore: Number(element.dataset.contextResourcesBefore),
      resourcesAfter: Number(element.dataset.contextResourcesAfter),
      bytesBefore: Number(element.dataset.contextBytesBefore),
      bytesAfter: Number(element.dataset.contextBytesAfter),
    }));
    if (values.strategy !== contextStrategy) failures.push(`Expected ${contextStrategy} context strategy, received ${values.strategy ?? 'missing'}`);
    if (!(values.generationAfter > values.generationBefore)) failures.push('Context generation did not advance');
    if (values.resourcesAfter !== values.resourcesBefore) failures.push('Context resource count changed after recovery');
    if (values.bytesAfter !== values.bytesBefore) failures.push('Context resource bytes changed after recovery');
    failures.push(...pageErrors.map((message) => `Context page error: ${message}`));
    return Object.freeze(values);
  } catch (error) {
    failures.push(`Context recovery failed: ${describe(error)}`);
    return undefined;
  } finally {
    await context.close();
  }
}

function url(query) {
  return `http://127.0.0.1:${port}/?${new URLSearchParams(query)}`;
}

function argument(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function describe(error) {
  return error instanceof Error ? error.message : String(error);
}
