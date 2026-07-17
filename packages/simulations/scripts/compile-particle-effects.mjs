import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  FIREWORKS_PARTICLE_PROGRAM,
  ORBITAL_SHRAPNEL_PARTICLE_PROGRAM,
  SPARKS_PARTICLE_PROGRAM,
} from '../src/index.ts';

const outputRoot = resolve(process.cwd(), '.generated', 'particle-effects');
await mkdir(outputRoot, { recursive: true });

const programs = [SPARKS_PARTICLE_PROGRAM, FIREWORKS_PARTICLE_PROGRAM, ORBITAL_SHRAPNEL_PARTICLE_PROGRAM]
  .slice()
  .sort((left, right) => left.effect.source.id.localeCompare(right.effect.source.id));
const indexEntries = [];

for (const program of programs) {
  const id = program.effect.source.id;
  const manifestPath = resolve(outputRoot, `${id}.manifest.json`);
  const qualityTiers = Object.keys(program.renderPasses).sort();
  const cacheKey = [
    `compiler-${program.effect.compilerVersion}`,
    `abi-${program.effect.stateAbiVersion}`,
    program.effect.graphHash,
    'webgl2-highp',
    'webgpu-f32',
    qualityTiers.join('-'),
  ].join(':');
  const manifest = {
    id,
    cacheKey,
    compilerVersion: program.effect.compilerVersion,
    stateAbiVersion: program.effect.stateAbiVersion,
    graphHash: program.effect.graphHash,
    abiHash: program.effect.abiHash,
    fallbackPolicy: program.effect.fallbackPolicy,
    backendRequirements: program.effect.backendRequirements,
    report: program.effect.report,
    reflection: program.reflection,
    renderPasses: program.renderPasses,
    qualityTiers,
    shaders: {
      webgl2Simulation: program.webgl2.simulation.hash,
      webgl2Event: program.webgl2.event?.hash,
      webgl2EventClaimVertex: program.webgl2.eventClaimVertex?.hash,
      webgl2EventClaimFragment: program.webgl2.eventClaimFragment?.hash,
      webgl2Vertex: program.webgl2.vertex.hash,
      webgl2Fragment: program.webgl2.fragment.hash,
      webgpuSimulation: program.webgpu.simulation.hash,
      webgpuEvent: program.webgpu.event?.hash,
      webgpuEventResolve: program.webgpu.eventResolve?.hash,
      webgpuRender: program.webgpu.render.hash,
    },
  };
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  const executable = `${JSON.stringify(program, null, 2)}\n`;
  let cached = false;
  try {
    cached = await readFile(manifestPath, 'utf8') === serialized
      && await readFile(resolve(outputRoot, `${id}.program.json`), 'utf8') === executable;
  } catch { /* cache miss */ }
  indexEntries.push({ id, cacheKey, graphHash: program.effect.graphHash, abiHash: program.effect.abiHash });
  if (cached) continue;
  await Promise.all([
    writeFile(manifestPath, serialized),
    writeFile(resolve(outputRoot, `${id}.program.json`), executable),
    writeFile(resolve(outputRoot, `${id}.simulation.glsl`), program.webgl2.simulation.source),
    writeFile(resolve(outputRoot, `${id}.event.glsl`), program.webgl2.event?.source ?? ''),
    writeFile(resolve(outputRoot, `${id}.event-claim.vert.glsl`), program.webgl2.eventClaimVertex?.source ?? ''),
    writeFile(resolve(outputRoot, `${id}.event-claim.frag.glsl`), program.webgl2.eventClaimFragment?.source ?? ''),
    writeFile(resolve(outputRoot, `${id}.vertex.glsl`), program.webgl2.vertex.source),
    writeFile(resolve(outputRoot, `${id}.fragment.glsl`), program.webgl2.fragment.source),
    writeFile(resolve(outputRoot, `${id}.simulation.wgsl`), program.webgpu.simulation.source),
    writeFile(resolve(outputRoot, `${id}.event.wgsl`), program.webgpu.event?.source ?? ''),
    writeFile(resolve(outputRoot, `${id}.event-resolve.wgsl`), program.webgpu.eventResolve?.source ?? ''),
    writeFile(resolve(outputRoot, `${id}.render.wgsl`), program.webgpu.render.source),
  ]);
}

const artifactIndex = `${JSON.stringify({
  schemaVersion: 1,
  programs: indexEntries,
}, null, 2)}\n`;
const indexPath = resolve(outputRoot, 'index.json');
let indexCached = false;
try { indexCached = await readFile(indexPath, 'utf8') === artifactIndex; } catch { /* cache miss */ }
if (!indexCached) await writeFile(indexPath, artifactIndex);
