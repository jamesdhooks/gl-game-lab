import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const defaultReferenceRoot = path.resolve(repositoryRoot, '..', 'gl-game-lab-reference-core-clean');
const referenceRoot = path.resolve(process.env.GL_GAME_LAB_REFERENCE_ROOT ?? defaultReferenceRoot);
const outputPath = path.join(repositoryRoot, 'docs', 'parity', 'reference-catalog.json');

const gamesModule = await importModule('packages/games/src/index.ts');
const simulationsModule = await importModule('packages/simulations/src/index.ts');
const defaults = JSON.parse(await readFile(path.join(referenceRoot, 'scene-defaults.json'), 'utf8'));

const gameRegistry = gamesModule.GAME_REGISTRY;
const simulationRegistry = simulationsModule.SIMULATION_REGISTRY;
if (!Array.isArray(gameRegistry) || !Array.isArray(simulationRegistry)) {
  throw new Error('Frozen reference packages do not export the expected registries');
}

const definitions = [...gameRegistry, ...simulationRegistry].map((definition) => sanitize(definition));
const sourceFiles = await collectReferenceSources();
const sourceHashes = {};
for (const relativePath of sourceFiles) {
  const contents = await readFile(path.join(referenceRoot, relativePath));
  sourceHashes[relativePath.replaceAll('\\', '/')] = createHash('sha256').update(contents).digest('hex');
}

const catalog = {
  schemaVersion: 1,
  referenceRevision: '1273b5f4145c5e9e87123cba535f5cc939a77a61',
  capturedAt: '2026-07-10',
  registryOrder: definitions.map((definition) => definition.id),
  definitions,
  sceneDefaults: defaults,
  sourceHashes,
};

await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
console.log(`Captured ${definitions.length} experience definitions to ${path.relative(repositoryRoot, outputPath)}`);

async function importModule(relativePath) {
  const absolutePath = path.join(referenceRoot, relativePath);
  return import(pathToFileURL(absolutePath).href);
}

function sanitize(value) {
  if (typeof value === 'string') return normalizeReferenceText(value);
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value !== 'object') return undefined;

  const result = {};
  for (const key of Object.keys(value).sort()) {
    const sanitized = sanitize(value[key]);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return result;
}

function normalizeReferenceText(value) {
  const formerProductName = ['Pi', 'xi Lab'].join('');
  const formerLibraryName = ['Pi', 'xiJS'].join('');
  return value
    .replaceAll(formerProductName, 'GLGameLab')
    .replaceAll(formerLibraryName, 'the former renderer');
}

async function collectReferenceSources() {
  const roots = ['packages/games/src', 'packages/simulations/src'];
  const files = [];
  for (const relativeRoot of roots) {
    await walk(relativeRoot, files);
  }
  return files
    .filter((relativePath) => {
      const normalized = relativePath.replaceAll('\\', '/');
      return (
        normalized.endsWith('.definition.ts') ||
        normalized.endsWith('.config.ts') ||
        normalized.endsWith('StyleManifest.ts') ||
        normalized.includes('/styles/')
      );
    })
    .sort();
}

async function walk(relativeDirectory, output) {
  const entries = await readdir(path.join(referenceRoot, relativeDirectory), { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) await walk(relativePath, output);
    else if (entry.isFile()) output.push(relativePath);
  }
}
