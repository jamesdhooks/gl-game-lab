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
const requestedScope = argument('scope') ?? 'all';
const requestedExecutable = process.env.GL_GAME_LAB_BROWSER_EXECUTABLE;
const requestedHeadless = optionalBooleanEnvironment('GL_GAME_LAB_BROWSER_HEADLESS');
const browserTypes = { chromium, firefox, webkit };
if (requested && !(requested in browserTypes)) throw new Error(`Unknown browser: ${requested}`);
if (!['all', 'shell', 'functional', 'context'].includes(requestedScope)) throw new Error(`Unknown browser release scope: ${requestedScope}`);
if (requestedExecutable && !requested) throw new Error('GL_GAME_LAB_BROWSER_EXECUTABLE requires one explicit --browser');
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
  execution: Object.freeze({
    contextStrategy: process.env.GL_GAME_LAB_CONTEXT_STRATEGY ?? 'driver',
    scope: requestedScope,
    executable: requestedExecutable ?? 'playwright-managed',
    headlessOverride: requestedHeadless ?? null,
  }),
  results,
  passed: results.every((result) => result.passed),
});
await writeFile(path.join(output, `report-${requested ?? 'all'}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 2;

async function verifyBrowser(browserName, browserType) {
  const failures = [];
  try {
    let version;
    let shell;
    let functional;
    let context;
    if (requestedScope === 'all' || requestedScope === 'shell' || requestedScope === 'functional') {
      const functionalBrowser = await browserType.launch(browserLaunchOptions(browserName));
      version = functionalBrowser.version();
      try {
        if (requestedScope === 'all' || requestedScope === 'shell') shell = await verifyDemoShell(functionalBrowser, failures);
        if (requestedScope === 'all' || requestedScope === 'shell') await verifyMobileDemoShell(functionalBrowser, failures);
        if (requestedScope === 'all' || requestedScope === 'functional') functional = await verifyFunctional(functionalBrowser, failures);
      } finally {
        await functionalBrowser.close();
      }
    }
    if (requestedScope === 'all' || requestedScope === 'context') {
      const contextBrowser = await browserType.launch(browserLaunchOptions(browserName));
      version ??= contextBrowser.version();
      context = await verifyContextRecovery(contextBrowser, failures)
        .finally(async () => { await contextBrowser.close(); });
    }
    return Object.freeze({ browser: browserName, version, shell, functional, context, failures, passed: failures.length === 0 });
  } catch (error) {
    failures.push(describe(error));
    return Object.freeze({ browser: browserName, failures, passed: false });
  }
}

async function verifyDemoShell(browser, failures) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => { pageErrors.push(error.message); });
  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'GLGameLab' }).waitFor({ state: 'visible', timeout: 60_000 });
    const cards = page.locator('[data-demo-experience-card]');
    await page.waitForFunction(() => document.querySelectorAll('[data-demo-experience-card]').length === 15, undefined, { timeout: 60_000 });
    const totalCards = await cards.count();
    if (totalCards !== 15) failures.push(`Expected 15 demo cards, received ${totalCards}`);
    if (await page.getByText('Needs QA', { exact: true }).count() !== 0) failures.push('Removed QA badges returned to the gallery');
    if (await page.getByRole('button', { name: 'Preview FPS On', exact: true }).count() !== 1) failures.push('Preview FPS control is missing');

    await page.getByRole('button', { name: 'Games', exact: true }).click();
    const gameCards = await cards.count();
    if (gameCards !== 1) failures.push(`Expected one game card, received ${gameCards}`);
    if (await page.locator('[data-demo-experience-card="ball-pit"]').count() !== 1) failures.push('Ball Pit is missing from the Games filter');

    await page.getByRole('button', { name: 'Simulations', exact: true }).click();
    const simulationCards = await cards.count();
    if (simulationCards !== 14) failures.push(`Expected 14 simulation cards, received ${simulationCards}`);

    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.locator('[data-demo-experience-card="ball-pit"]').click();
    await page.locator('[data-experience-id="ball-pit"] canvas[data-engine-state="running"]').waitFor({ state: 'visible', timeout: 60_000 });
    await page.locator('.gl-experience-intro-card').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('.gl-experience-intro-card').click();
    for (const label of ['Quit', 'Palette', 'Next palette', 'Reset', 'Settings', 'Hide UI', 'Demo mode', 'Info']) {
      if (await page.getByRole('button', { name: label, exact: true }).count() !== 1) failures.push(`Launcher control is missing: ${label}`);
    }
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.locator('[aria-label="Ball Pit settings"]').waitFor({ state: 'visible', timeout: 10_000 });
    const settingCount = await page.locator('[aria-label="Ball Pit settings"] [data-experience-setting]').count();
    if (settingCount < 10) failures.push(`Ball Pit settings drawer exposed only ${settingCount} controls`);
    await page.getByRole('button', { name: 'Pin settings as sidebar' }).click();
    await page.getByRole('button', { name: 'Undock settings sidebar' }).waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByRole('button', { name: 'Resize settings sidebar' }).waitFor({ state: 'visible', timeout: 10_000 });
    const dockedSettingsWidth = await page.locator('[aria-label="Ball Pit settings"]').evaluate((element) => element.getBoundingClientRect().width);
    if (dockedSettingsWidth < 320) failures.push(`Docked settings sidebar width was only ${dockedSettingsWidth}px`);
    await page.getByRole('button', { name: 'Undock settings sidebar' }).click();
    await page.getByRole('button', { name: 'Pin settings as sidebar' }).waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByRole('button', { name: 'Close settings' }).click();
    await page.getByRole('button', { name: 'Show experience picker' }).click();
    await page.getByRole('button', { name: 'Move to left' }).click();
    await page.getByRole('button', { name: 'Dock', exact: true }).click();
    await page.locator('[data-picker-side="left"][data-picker-docked="true"]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByRole('button', { name: 'Close carousel' }).click();
    await page.getByRole('button', { name: 'Info', exact: true }).click();
    await page.locator('.gl-experience-intro-card').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('.gl-experience-intro-card').click();
    await page.getByRole('button', { name: 'Quit', exact: true }).click();
    await page.locator('[data-demo-experience-card="water-tank"]').click();
    await page.locator('[data-experience-id="water-tank"] canvas[data-engine-state="running"]').waitFor({ state: 'visible', timeout: 60_000 });
    await page.locator('.gl-experience-intro-card').click();
    for (const style of ['Basic', 'Enhanced', 'Ultra']) {
      if (await page.getByRole('button', { name: style, exact: true }).count() !== 1) failures.push(`Water Tank render style is missing: ${style}`);
    }
    if (await page.locator('[data-experience-setting]').count() !== 0) failures.push('Scene tuning controls leaked onto the canvas');
    if (await page.getByRole('button', { name: 'Randomize settings', exact: true }).count() !== 1) failures.push('Simulation randomizer is missing');
    await page.getByRole('button', { name: 'Basic', exact: true }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    if (await page.getByText('Enhanced Surface', { exact: true }).count() !== 0) failures.push('Enhanced-only settings remained visible in Basic mode');
    await page.getByRole('button', { name: 'Close settings' }).click();
    failures.push(...pageErrors.map((message) => `Demo shell page error: ${message}`));
    return Object.freeze({ totalCards, gameCards, simulationCards, intro: true, settings: settingCount, settingsDock: true, picker: true, info: true });
  } catch (error) {
    failures.push(`Demo shell failed: ${describe(error)}`);
    return undefined;
  } finally {
    await context.close();
  }
}

async function verifyMobileDemoShell(browser, failures) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => { pageErrors.push(error.message); });
  try {
    await page.goto(`http://127.0.0.1:${port}/?experience=ball-pit`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-experience-id="ball-pit"] canvas[data-engine-state="running"]').waitFor({ state: 'visible', timeout: 60_000 });
    await page.locator('.gl-experience-intro-card').click();
    await page.getByRole('button', { name: 'More controls' }).click();
    await page.getByText('Controls', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
    for (const label of ['Reset', 'Settings', 'Hide UI', 'Demo mode', 'How to play']) {
      if (await page.getByText(label, { exact: true }).count() < 1) failures.push(`Mobile legacy control is missing: ${label}`);
    }
    if (await page.getByRole('button', { name: 'Palette', exact: true }).count() !== 1) failures.push('Mobile palette picker is missing');
    if (await page.getByRole('button', { name: 'Tap to drop one ball.', exact: true }).count() !== 1) failures.push('Mobile mode controls are missing');
    failures.push(...pageErrors.map((message) => `Mobile demo shell page error: ${message}`));
    return Object.freeze({ overflow: true, style: true, modes: true });
  } catch (error) {
    failures.push(`Mobile demo shell failed: ${describe(error)}`);
    return undefined;
  } finally {
    await context.close();
  }
}

function browserLaunchOptions(browserName) {
  const options = {
    headless: requestedHeadless ?? browserName !== 'firefox',
  };
  if (requestedExecutable) options.executablePath = requestedExecutable;
  if (browserName !== 'firefox') return options;
  return {
    ...options,
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
      const runtimeError = await controls.getAttribute('data-diagnostic-error');
      throw new Error(`Context cycle ended with ${status ?? 'missing status'}${runtimeError ? `: ${runtimeError.trim()}` : ''}`);
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

function optionalBooleanEnvironment(name) {
  const value = process.env[name];
  if (value === undefined) return undefined;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new Error(`${name} must be true, false, 1, or 0`);
}
