import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  FIREWORKS_PARTICLE_PROGRAM,
  ORBITAL_SHRAPNEL_PARTICLE_PROGRAM,
  SPARKS_PARTICLE_PROGRAM,
} from '../dist/index.js';

const outputRoot = resolve(process.cwd(), '.generated', 'particle-effects');
await mkdir(outputRoot, { recursive: true });

for (const program of [SPARKS_PARTICLE_PROGRAM, FIREWORKS_PARTICLE_PROGRAM, ORBITAL_SHRAPNEL_PARTICLE_PROGRAM]) {
  const id = program.effect.source.id;
  const manifestPath = resolve(outputRoot, `${id}.manifest.json`);
  const manifest = {
    id,
    compilerVersion: program.effect.compilerVersion,
    stateAbiVersion: program.effect.stateAbiVersion,
    graphHash: program.effect.graphHash,
    abiHash: program.effect.abiHash,
    fallbackPolicy: program.effect.fallbackPolicy,
    backendRequirements: program.effect.backendRequirements,
    report: program.effect.report,
    reflection: program.reflection,
    renderPasses: program.renderPasses,
    shaders: {
      webgl2Simulation: program.webgl2.simulation.hash,
      webgl2Event: program.webgl2.event?.hash,
      webgl2Vertex: program.webgl2.vertex.hash,
      webgl2Fragment: program.webgl2.fragment.hash,
      webgpuSimulation: program.webgpu.simulation.hash,
      webgpuRender: program.webgpu.render.hash,
    },
  };
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  let cached = false;
  try { cached = await readFile(manifestPath, 'utf8') === serialized; } catch { /* cache miss */ }
  if (cached) continue;
  await Promise.all([
    writeFile(manifestPath, serialized),
    writeFile(resolve(outputRoot, `${id}.simulation.glsl`), program.webgl2.simulation.source),
    writeFile(resolve(outputRoot, `${id}.event.glsl`), program.webgl2.event?.source ?? ''),
    writeFile(resolve(outputRoot, `${id}.vertex.glsl`), program.webgl2.vertex.source),
    writeFile(resolve(outputRoot, `${id}.fragment.glsl`), program.webgl2.fragment.source),
    writeFile(resolve(outputRoot, `${id}.simulation.wgsl`), program.webgpu.simulation.source),
    writeFile(resolve(outputRoot, `${id}.render.wgsl`), program.webgpu.render.source),
  ]);
}
