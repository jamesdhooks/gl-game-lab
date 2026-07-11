import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesRoot = resolve(repositoryRoot, 'packages');
const baselinePath = resolve(repositoryRoot, 'docs', 'audit', 'source-hygiene-baseline.json');
const baseline = existsSync(baselinePath)
  ? new Set(JSON.parse(readFileSync(baselinePath, 'utf8')).longLines)
  : new Set();
const violations = [];
const currentLongLines = new Set();

for (const filePath of walk(packagesRoot)) {
  if (!/\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(filePath)) continue;
  if (filePath.includes(`${resolve(packagesRoot, 'demo')}\\`)) continue;

  const projectPath = normalize(relative(repositoryRoot, filePath));
  const source = readFileSync(filePath, 'utf8');
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.length > 500) currentLongLines.add(projectPath);
    if (/\bconsole\.log\s*\(/.test(line)) report(projectPath, index + 1, 'console.log in library source');
    if (/\@ts-ignore\b|\@ts-nocheck\b/.test(line)) report(projectPath, index + 1, 'unexplained TypeScript suppression');
    if (/(?:\bas\s+any\b|:\s*any\b|<any>)/.test(line)) report(projectPath, index + 1, 'explicit any is forbidden');
    if (/\bpixi(?:js)?\b/i.test(line)) report(projectPath, index + 1, 'legacy renderer or product name');
  }
}

for (const projectPath of currentLongLines) {
  if (!baseline.has(projectPath)) violations.push(`${projectPath}: contains a line longer than 500 characters`);
}
for (const projectPath of baseline) {
  if (!currentLongLines.has(projectPath)) {
    violations.push(`${projectPath}: stale long-line baseline entry; remove it after formatting the file`);
  }
}

if (violations.length > 0) {
  console.error('Source hygiene violations:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.info(`Source hygiene verified; ${baseline.size} explicitly tracked formatting-debt files remain.`);
}

function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'dist' || entry.name === 'node_modules') continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

function normalize(path) {
  return path.replaceAll('\\', '/');
}

function report(projectPath, line, message) {
  violations.push(`${projectPath}:${line}: ${message}`);
}
