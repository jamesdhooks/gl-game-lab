import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesRoot = resolve(repositoryRoot, 'packages');
const workspacePrefix = '@hooksjam/gl-game-lab-';
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

const packageRecords = readdirSync(packagesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const root = resolve(packagesRoot, entry.name);
    const manifestPath = resolve(root, 'package.json');
    if (!existsSync(manifestPath)) return undefined;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return { directoryName: entry.name, root, manifest, manifestPath };
  })
  .filter(Boolean);

const packageByName = new Map(packageRecords.map((record) => [record.manifest.name, record]));
const violations = [];

for (const record of packageRecords) {
  const sourceRoot = resolve(record.root, 'src');
  if (!existsSync(sourceRoot)) continue;

  for (const filePath of walk(sourceRoot)) {
    if (!sourceExtensions.has(extensionOf(filePath))) continue;
    const source = readFileSync(filePath, 'utf8');
    const imports = collectModuleSpecifiers(source);

    for (const specifier of imports) {
      if (specifier.startsWith('.')) {
        const target = resolve(dirname(filePath), specifier);
        if (target !== record.root && !target.startsWith(`${record.root}${sep}`)) {
          report(filePath, `relative import escapes package boundary: ${specifier}`);
        }
        continue;
      }

      if (!specifier.startsWith(workspacePrefix)) continue;
      const importedName = workspacePackageName(specifier);
      if (!packageByName.has(importedName)) {
        report(filePath, `unknown GLGameLab workspace package import: ${specifier}`);
        continue;
      }
      if (specifier !== importedName) {
        report(filePath, `workspace package must be imported through its public root export: ${specifier}`);
      }
      if (importedName === record.manifest.name) continue;

      const dependencies = {
        ...record.manifest.dependencies,
        ...record.manifest.devDependencies,
        ...record.manifest.peerDependencies,
        ...record.manifest.optionalDependencies,
      };
      if (!(importedName in dependencies)) {
        report(filePath, `imports undeclared workspace dependency ${importedName}`);
      }
    }

    if (record.directoryName === 'core') {
      checkCoreIsolation(filePath, source, imports);
    }
  }
}

if (violations.length > 0) {
  console.error('Package boundary violations:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.info(`Package boundaries verified across ${packageRecords.length} workspace packages.`);
}

function checkCoreIsolation(filePath, source, imports) {
  const forbiddenModules = ['react', 'react-dom', 'pixi.js', 'three', 'planck', 'matter-js'];
  for (const specifier of imports) {
    if (specifier.startsWith(workspacePrefix)) {
      report(filePath, `core cannot depend on another workspace package: ${specifier}`);
    }
    if (forbiddenModules.some((name) => specifier === name || specifier.startsWith(`${name}/`))) {
      report(filePath, `core cannot import platform or implementation module: ${specifier}`);
    }
  }

  const forbiddenRuntimeIdentifiers = [
    'WebGLRenderingContext',
    'WebGL2RenderingContext',
    'HTMLCanvasElement',
    'AudioContext',
    'localStorage',
    'sessionStorage',
  ];
  for (const identifier of forbiddenRuntimeIdentifiers) {
    if (new RegExp(`\\b${identifier}\\b`).test(source)) {
      report(filePath, `core references platform-specific API ${identifier}`);
    }
  }
}

function collectModuleSpecifiers(source) {
  const values = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) values.add(match[1]);
  }
  return values;
}

function workspacePackageName(specifier) {
  const slash = specifier.indexOf('/', workspacePrefix.length);
  return slash === -1 ? specifier : specifier.slice(0, slash);
}

function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile() || statSync(path).isFile()) yield path;
  }
}

function extensionOf(filePath) {
  const name = filePath.slice(filePath.lastIndexOf(sep) + 1);
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot);
}

function report(filePath, message) {
  violations.push(`${relative(repositoryRoot, filePath)}: ${message}`);
}
