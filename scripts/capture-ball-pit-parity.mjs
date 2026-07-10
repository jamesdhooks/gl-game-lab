import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { checksumRgba, compareRgba, compareRgbaAtScale } from '../packages/tools/dist/index.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const referenceRoot = path.resolve(
  process.env.GL_GAME_LAB_REFERENCE_ROOT ?? path.join(repositoryRoot, '..', 'gl-game-lab-reference-core-clean'),
);
const outputDirectory = path.resolve(
  process.env.GL_GAME_LAB_PARITY_OUTPUT ?? path.join(repositoryRoot, '.artifacts', 'parity', 'ball-pit'),
);
const browserExecutable = process.env.GL_GAME_LAB_BROWSER_EXECUTABLE ?? findBrowserExecutable();
const rebuildPort = 5173;
const referencePort = 5174;
const referenceBasePath = ['pi', 'xi', '-lab'].join('');
const width = 960;
const height = 540;
const staticFrameNumber = 1;
const dynamicFrameNumbers = [60, 120, 180];
const fixedDeltaSeconds = 1 / 60;
const seed = 7;
const style = 'rainbow';
const mode = 'single';
const spatialCellSize = 32;
const staticSsimThreshold = 0.97;
const dynamicMinimumSpatialThreshold = 0.8;
const dynamicMeanSpatialThreshold = 0.9;
const referenceRevision = '1273b5f4145c5e9e87123cba535f5cc939a77a61';

await mkdir(outputDirectory, { recursive: true });
const servers = [
  startVite(repositoryRoot, path.join(repositoryRoot, 'packages', 'demo'), rebuildPort),
  startVite(referenceRoot, path.join(referenceRoot, 'packages', 'demo'), referencePort),
];

let browser;
try {
  await Promise.all([
    waitForServer(`http://127.0.0.1:${rebuildPort}/`),
    waitForServer(`http://127.0.0.1:${referencePort}/${referenceBasePath}/`),
  ]);
  browser = await chromium.launch({
    executablePath: browserExecutable,
    headless: true,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  const staticPair = await capturePair(browser, {
    frameNumber: staticFrameNumber,
    profile: 'play',
    demo: false,
    artifactPrefix: 'static',
  });
  const dynamicFrames = [];
  for (const dynamicFrameNumber of dynamicFrameNumbers) {
    dynamicFrames.push(await capturePair(browser, {
      frameNumber: dynamicFrameNumber,
      profile: 'demo',
      demo: true,
      artifactPrefix: `demo-${String(dynamicFrameNumber).padStart(4, '0')}`,
    }));
  }
  const finalDynamicFrame = dynamicFrames[dynamicFrames.length - 1];
  if (!finalDynamicFrame) throw new Error('Dynamic capture sequence is empty');
  requireNonBlank(PNG.sync.read(finalDynamicFrame.reference.png), 'Frozen reference final demo frame');
  requireNonBlank(PNG.sync.read(finalDynamicFrame.rebuild.png), 'Rebuild final demo frame');
  const dynamicSimilarities = dynamicFrames.map((frame) => frame.comparison.spatial.spatialSimilarity);
  const dynamic = {
    cellSize: spatialCellSize,
    minimumThreshold: dynamicMinimumSpatialThreshold,
    meanThreshold: dynamicMeanSpatialThreshold,
    minimumSpatialSimilarity: Math.min(...dynamicSimilarities),
    meanSpatialSimilarity: dynamicSimilarities.reduce((sum, value) => sum + value, 0) / dynamicSimilarities.length,
    passed: Math.min(...dynamicSimilarities) >= dynamicMinimumSpatialThreshold
      && dynamicSimilarities.reduce((sum, value) => sum + value, 0) / dynamicSimilarities.length >= dynamicMeanSpatialThreshold,
    frames: dynamicFrames.map(stripPng),
  };
  const report = {
    schemaVersion: 1,
    experienceId: 'ball-pit',
    referenceRevision,
    capture: { width, height, fixedDeltaSeconds, seed, style, mode },
    static: stripPng(staticPair),
    dynamic,
    passed: staticPair.comparison.pixel.passed && dynamic.passed,
  };
  await writeFile(path.join(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 2;
} finally {
  await browser?.close();
  for (const server of servers) server.stop();
}

async function capturePair(activeBrowser, options) {
  const context = await activeBrowser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    const reference = await captureReference(context, options);
    const rebuild = await captureRebuild(context, options);
    const referencePng = PNG.sync.read(reference.png);
    const rebuildPng = PNG.sync.read(rebuild.png);
    requireDimensions(referencePng, 'Frozen reference');
    requireDimensions(rebuildPng, 'Rebuild');
    const comparison = {
      pixel: compareRgba(referencePng.data, rebuildPng.data, width, height, staticSsimThreshold),
      spatial: compareRgbaAtScale(
        referencePng.data,
        rebuildPng.data,
        width,
        height,
        spatialCellSize,
        dynamicMinimumSpatialThreshold,
      ),
    };
    await Promise.all([
      writeFile(path.join(outputDirectory, `${options.artifactPrefix}-reference.png`), reference.png),
      writeFile(path.join(outputDirectory, `${options.artifactPrefix}-rebuild.png`), rebuild.png),
    ]);
    return {
      frameNumber: options.frameNumber,
      profile: options.profile,
      reference,
      rebuild,
      comparison,
    };
  } finally {
    await context.close();
  }
}

async function captureReference(context, options) {
  const page = await context.newPage();
  const logs = collectBrowserMessages(page);
  await page.addInitScript((initialSeed) => {
    let state = initialSeed >>> 0;
    Math.random = () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 0x1_0000_0000;
    };
  }, seed);
  await page.clock.install({ time: new Date('2026-07-10T12:00:00.000Z') });
  const url = `http://127.0.0.1:${referencePort}/${referenceBasePath}/?experience=ball-pit&backend=webgl2&profile=high`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForFrozenRuntime(page);
  const dismiss = page.getByText('Tap anywhere to dismiss', { exact: true });
  if (await dismiss.count()) {
    await dismiss.click();
    await page.clock.runFor(300);
  }
  if (options.demo) {
    await page.getByRole('button', { name: 'More controls' }).click();
    await page.clock.runFor(100);
    const exitDemo = page.locator('button[aria-label="Exit demo"]');
    let enteredDemo = false;
    for (let attempt = 0; attempt < 30 && !enteredDemo; attempt += 1) {
      const demoButton = page.getByRole('button', { name: 'Demo mode' });
      if (await demoButton.count() === 1) await demoButton.click();
      await page.mouse.move(100, 100);
      await page.clock.runFor(100);
      enteredDemo = await exitDemo.count() === 1;
    }
    if (!enteredDemo) throw new Error('Frozen runtime did not enter Demo mode');
  }
  await page.clock.runFor(options.frameNumber * fixedDeltaSeconds * 1000);
  const canvas = page.locator('canvas.h-full.w-full.touch-none.bg-slate-950');
  await canvas.waitFor({ state: 'visible' });
  await isolateCanvas(page, 'canvas.h-full.w-full.touch-none.bg-slate-950');
  const png = await canvas.screenshot({ type: 'png' });
  await page.close();
  return {
    png,
    metadata: {
      url,
      clock: 'virtual',
      durationMilliseconds: options.frameNumber * fixedDeltaSeconds * 1000,
      pngSha256: sha256(png),
      logs,
    },
  };
}

async function waitForFrozenRuntime(page) {
  const debug = page.locator('button[aria-label="Open debug panel"]');
  await debug.waitFor({ state: 'visible', timeout: 30_000 });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.clock.runFor(100);
    const text = (await debug.textContent())?.trim() ?? '';
    if (text !== '' && text !== '--') return;
  }
  throw new Error('Frozen runtime did not report a frame rate before capture');
}

async function captureRebuild(context, options) {
  const page = await context.newPage();
  const logs = collectBrowserMessages(page);
  const query = new URLSearchParams({
    capture: '1',
    frame: String(options.frameNumber),
    delta: String(fixedDeltaSeconds),
    profile: options.profile,
    seed: String(seed),
    mode,
    style,
  });
  const url = `http://127.0.0.1:${rebuildPort}/?${query}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const canvas = page.locator('canvas[data-engine-state="capture-ready"]');
  await canvas.waitFor({ state: 'visible', timeout: 30_000 });
  const metadata = await canvas.evaluate((element) => ({
    frame: Number(element.dataset.captureFrame),
    fixedDeltaSeconds: Number(element.dataset.captureDelta),
    cpuP95Milliseconds: Number(element.dataset.captureCpuP95),
    framebufferChecksum: element.dataset.captureChecksum,
  }));
  const png = await canvas.screenshot({ type: 'png' });
  await page.close();
  return {
    png,
    metadata: { url, ...metadata, pngSha256: sha256(png), logs },
  };
}

function startVite(root, demoDirectory, port) {
  const viteBin = path.join(demoDirectory, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: demoDirectory,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  child.once('exit', (code) => {
    if (code && code !== 0) process.stderr.write(`Vite server under ${root} exited with ${code}:\n${output}\n`);
  });
  return { stop: () => { if (!child.killed) child.kill(); } };
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function collectBrowserMessages(page) {
  const messages = [];
  page.on('pageerror', (error) => { messages.push(error.message); });
  return messages;
}

function stripPng(pair) {
  return {
    frameNumber: pair.frameNumber,
    profile: pair.profile,
    reference: pair.reference.metadata,
    rebuild: pair.rebuild.metadata,
    comparison: pair.comparison,
  };
}

async function isolateCanvas(page, selector) {
  await page.evaluate((canvasSelector) => {
    const canvas = document.querySelector(canvasSelector);
    if (!canvas) throw new Error(`Missing canvas: ${canvasSelector}`);
    for (const element of document.body.querySelectorAll('*')) {
      if (element === canvas || element.contains(canvas) || canvas.contains(element)) continue;
      element.style.setProperty('visibility', 'hidden', 'important');
    }
  }, selector);
}

function requireDimensions(png, label) {
  if (png.width !== width || png.height !== height) {
    throw new Error(`${label} capture was ${png.width}x${png.height}; expected ${width}x${height}`);
  }
}

function requireNonBlank(png, label) {
  let minimum = 255;
  let maximum = 0;
  for (let offset = 0; offset < png.data.length; offset += 4) {
    const luminance = (png.data[offset] ?? 0) * 0.2126
      + (png.data[offset + 1] ?? 0) * 0.7152
      + (png.data[offset + 2] ?? 0) * 0.0722;
    minimum = Math.min(minimum, luminance);
    maximum = Math.max(maximum, luminance);
  }
  if (maximum - minimum < 5) throw new Error(`${label} capture is blank or uniform`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function findBrowserExecutable() {
  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      ]
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const candidate = candidates.find((value) => path.isAbsolute(value) && existsSync(value));
  if (!candidate) throw new Error('Set GL_GAME_LAB_BROWSER_EXECUTABLE to a Chromium-compatible browser');
  return candidate;
}
