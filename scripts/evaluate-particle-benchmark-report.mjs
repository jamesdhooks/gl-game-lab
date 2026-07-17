import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { evaluateParticleBenchmarkGate } from './particle-benchmark-policy.mjs';

const requested = process.argv[2];
if (!requested) throw new Error('Usage: node scripts/evaluate-particle-benchmark-report.mjs <matrix-report.json> [--write]');
const reportPath = path.resolve(requested);
const report = JSON.parse(await readFile(reportPath, 'utf8'));
if (!Array.isArray(report.results)) throw new Error('Particle benchmark matrix has no results');
const mobile = report.mode === 'mobile-preview-gate';
const results = report.results.map((entry) => ({ ...entry, gate: evaluateParticleBenchmarkGate(entry, mobile) }));
const evaluated = {
  ...report,
  evaluationPolicy: {
    id: 'display-refresh-tolerant-v1',
    note: '60 FPS gates require at least 59 average FPS; GPU p95 budgets are unchanged.',
  },
  results,
  passed: results.every((entry) => (entry.pageErrors?.length ?? 0) === 0 && entry.gate.passed),
};
if (process.argv.includes('--write')) await writeFile(reportPath, `${JSON.stringify(evaluated, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ report: reportPath, workloads: results.length, passed: evaluated.passed })}\n`);
