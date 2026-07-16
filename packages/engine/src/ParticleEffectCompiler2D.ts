import type { CompiledParticleEffect2D } from './ParticleEffectGraph2D.js';
import type { ParticleRenderTier2D } from './ParticleEffects2D.js';

export type ParticleShaderBackend2D = 'webgl2' | 'webgpu';
export type ParticleShaderStage2D = 'simulation' | 'event' | 'vertex' | 'fragment';

export interface ParticleShaderBinding2D {
  readonly name: string;
  readonly kind: 'uniform' | 'texture' | 'sampler' | 'storage' | 'render-target';
  readonly dataType: string;
  readonly required: boolean;
}

export interface ParticleShaderReflection2D {
  readonly bindings: readonly ParticleShaderBinding2D[];
  readonly stateTargets: 2 | 3;
  readonly archetypeCount: number;
  readonly usesCollisions: boolean;
  readonly usesEvents: boolean;
  readonly usesTurbulence: boolean;
}

export interface ParticleCompiledShader2D {
  readonly backend: ParticleShaderBackend2D;
  readonly stage: ParticleShaderStage2D;
  readonly entryPoint: string;
  readonly source: string;
  readonly hash: string;
}

export interface CompiledParticleRenderPass2D {
  readonly id: string;
  readonly tier: ParticleRenderTier2D;
  readonly kind: 'points' | 'streaks' | 'trails' | 'bloom';
  readonly blend: 'opaque' | 'alpha' | 'additive' | 'multiply';
}

export interface ParticleModuleCompilerExtension2D {
  readonly id: string;
  readonly supports: readonly ParticleShaderBackend2D[];
  readonly parameters?: Readonly<Record<string, 'number' | 'boolean' | 'vector2' | 'color'>>;
  readonly cpuReference: (state: Float32Array, parameters: Readonly<Record<string, number>>, deltaSeconds: number) => void;
  readonly glslSimulation?: string;
  readonly glslRender?: string;
  readonly wgslSimulation?: string;
  readonly bindings?: readonly ParticleShaderBinding2D[];
}

export interface CompiledParticleProgram2D {
  readonly effect: CompiledParticleEffect2D;
  readonly webgl2: {
    readonly simulation: ParticleCompiledShader2D;
    readonly event?: ParticleCompiledShader2D;
    readonly vertex: ParticleCompiledShader2D;
    readonly fragment: ParticleCompiledShader2D;
  };
  readonly webgpu: {
    readonly simulation: ParticleCompiledShader2D;
    readonly render: ParticleCompiledShader2D;
  };
  readonly renderPasses: Readonly<Record<ParticleRenderTier2D, readonly CompiledParticleRenderPass2D[]>>;
  readonly reflection: ParticleShaderReflection2D;
}

export function compileParticleProgram2D(
  effect: CompiledParticleEffect2D,
  extensions: readonly ParticleModuleCompilerExtension2D[] = [],
): CompiledParticleProgram2D {
  validateExtensions(extensions);
  validateRequiredExtensions(effect, extensions);
  if (effect.source.archetypes.length > 32) throw new Error('Particle compiler supports at most 32 archetypes per effect');
  const usesCollisions = effect.source.archetypes.some((entry) => entry.collision !== undefined);
  const usesEvents = effect.source.archetypes.some((entry) => (entry.events?.length ?? 0) > 0);
  const usesTurbulence = effect.source.archetypes.some((entry) => (entry.motion.turbulence ?? 0) !== 0);
  const bindings = baseBindings(effect.report.requiredStateTargets, usesCollisions, usesEvents, extensions);
  const reflection: ParticleShaderReflection2D = Object.freeze({
    bindings: Object.freeze(bindings),
    stateTargets: effect.report.requiredStateTargets,
    archetypeCount: effect.source.archetypes.length,
    usesCollisions,
    usesEvents,
    usesTurbulence,
  });
  const glslSimulation = buildGlslSimulation(effect, extensions, usesCollisions, usesTurbulence);
  const glslEvent = usesEvents ? buildGlslEvent(effect) : undefined;
  const glslVertex = buildGlslVertex(effect, extensions);
  const glslFragment = buildGlslFragment(extensions);
  const wgslSimulation = buildWgslSimulation(effect, extensions, usesCollisions, usesTurbulence);
  const wgslRender = buildWgslRender();
  return Object.freeze({
    effect,
    webgl2: Object.freeze({
      simulation: shader('webgl2', 'simulation', 'main', glslSimulation),
      ...(glslEvent === undefined ? {} : { event: shader('webgl2', 'event', 'main', glslEvent) }),
      vertex: shader('webgl2', 'vertex', 'main', glslVertex),
      fragment: shader('webgl2', 'fragment', 'main', glslFragment),
    }),
    webgpu: Object.freeze({
      simulation: shader('webgpu', 'simulation', 'simulate', wgslSimulation),
      render: shader('webgpu', 'vertex', 'particleVertex', wgslRender),
    }),
    renderPasses: compileRenderPasses(effect),
    reflection,
  });
}

export function validateParticleShaderBindings2D(
  reflection: ParticleShaderReflection2D,
  available: ReadonlySet<string>,
): void {
  for (const binding of reflection.bindings) if (binding.required && !available.has(binding.name)) throw new Error(`Missing required particle shader binding: ${binding.name}`);
}

function buildGlslSimulation(effect: CompiledParticleEffect2D, extensions: readonly ParticleModuleCompilerExtension2D[], collisions: boolean, turbulence: boolean): string {
  const targets = effect.report.requiredStateTargets;
  return `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uPositionState;
uniform sampler2D uVelocityState;
${targets === 3 ? 'uniform sampler2D uMetadataState;' : ''}
uniform ivec2 uStateSize;
uniform int uCapacity;
uniform sampler2D uParticleCommandData;
uniform int uParticleCommandCount;
uniform int uParticleCommandTexels;
uniform int uParticleCommandFrameStart;
uniform float uDt;
uniform vec2 uCanvasSize;
uniform vec4 uArchetypeMotion[${Math.max(1, effect.source.archetypes.length)}];
layout(location=0) out vec4 outPosition;
layout(location=1) out vec4 outVelocity;
${targets === 3 ? 'layout(location=2) out vec4 outMetadata;' : ''}
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
bool readCommand(int id, out vec4 a, out vec4 b, out vec4 c, out vec4 d, out int relative) {
  if (uParticleCommandCount <= 0) return false;
  int candidate = (id - uParticleCommandFrameStart + uCapacity) % uCapacity;
  int low = 0, high = uParticleCommandCount;
  // The command texture stores monotonically increasing prefix starts. With a
  // maximum of 64 commands, six lower-bound comparisons are sufficient.
  for (int iteration = 0; iteration < 6; iteration++) {
    int middle = (low + high) / 2;
    if (middle >= uParticleCommandCount) { high = middle; continue; }
    vec4 probe = texelFetch(uParticleCommandData, ivec2(middle * uParticleCommandTexels, 0), 0);
    if (int(probe.y + .5) <= candidate) low = middle + 1; else high = middle;
  }
  int commandIndex = low - 1;
  if (commandIndex < 0 || commandIndex >= uParticleCommandCount) return false;
  int offset = commandIndex * uParticleCommandTexels;
  a = texelFetch(uParticleCommandData, ivec2(offset, 0), 0);
  relative = candidate - int(a.y + .5);
  if (relative < 0 || relative >= int(a.z + .5)) return false;
  b=texelFetch(uParticleCommandData,ivec2(offset+1,0),0);
  c=texelFetch(uParticleCommandData,ivec2(offset+2,0),0);
  d=texelFetch(uParticleCommandData,ivec2(offset+3,0),0);
  return true;
}
void main() {
  ivec2 uv = ivec2(gl_FragCoord.xy);
  int id = uv.y * uStateSize.x + uv.x;
  vec4 stateA = texelFetch(uPositionState, uv, 0);
  vec4 stateB = texelFetch(uVelocityState, uv, 0);
  ${targets === 3 ? 'vec4 stateC = texelFetch(uMetadataState, uv, 0);' : 'vec4 stateC = vec4(0.0);'}
  int archetype = clamp(int(stateC.x + 0.5), 0, ${Math.max(0, effect.source.archetypes.length - 1)});
  vec4 motion = uArchetypeMotion[archetype];
  if (stateA.z < stateA.w) {
    stateA.z += uDt;
    stateB.y += motion.x * uDt;
    stateB.xy *= exp(-max(0.0, motion.y) * uDt);
    ${turbulence ? 'float noise = hash21(stateA.xy + stateC.zz); stateB.xy += vec2(cos(noise * 6.2831853), sin(noise * 6.2831853)) * motion.z * uDt;' : ''}
    stateB.w += motion.w * uDt;
    stateB.z += stateB.w * uDt;
    stateA.xy += stateB.xy * uDt;
    ${collisions ? 'stateA.xy = clamp(stateA.xy, vec2(0.0), uCanvasSize);' : ''}
  }
  vec4 commandA=vec4(0), commandB=vec4(0), commandC=vec4(0), commandD=vec4(0); int relative=0;
  if (id < uCapacity && readCommand(id, commandA, commandB, commandC, commandD, relative)) {
    float angle = commandC.x + (hash21(vec2(commandD.x + float(relative), 1.0)) - .5) * commandC.y;
    float power = commandC.z * mix(.72, 1.28, hash21(vec2(commandD.x + float(relative), 2.0)));
    stateA = vec4(commandB.xy, 0.0, commandC.w * mix(max(.05, 1.0-commandD.z), 1.0+commandD.z, hash21(vec2(commandD.x + float(relative), 3.0))));
    stateB = vec4(commandB.zw + vec2(cos(angle), sin(angle)) * power, 0.0, 0.0);
    stateC = vec4(commandA.x, 0.0, commandD.y + hash21(vec2(commandD.x + float(relative), 4.0)), 0.0);
  }
  ${extensions.map((entry) => entry.glslSimulation ?? '').filter(Boolean).join('\n  ')}
  outPosition = stateA;
  outVelocity = stateB;
  ${targets === 3 ? 'outMetadata = stateC;' : ''}
}`;
}

function buildGlslEvent(effect: CompiledParticleEffect2D): string {
  return `#version 300 es
precision highp float;
uniform sampler2D uPositionState;
uniform sampler2D uVelocityState;
uniform sampler2D uMetadataState;
uniform float uDt;
layout(location=0) out vec4 outPosition;
layout(location=1) out vec4 outVelocity;
layout(location=2) out vec4 outMetadata;
void main() {
  ivec2 uv = ivec2(gl_FragCoord.xy);
  vec4 a = texelFetch(uPositionState, uv, 0);
  vec4 b = texelFetch(uVelocityState, uv, 0);
  vec4 c = texelFetch(uMetadataState, uv, 0);
  // Event allocation remains backend-owned; the compiler supplies the versioned metadata semantics.
  c.w = c.w;
  outPosition = a; outVelocity = b; outMetadata = c;
}`;
}

function buildGlslVertex(effect: CompiledParticleEffect2D, extensions: readonly ParticleModuleCompilerExtension2D[]): string {
  const targets = effect.report.requiredStateTargets;
  return `#version 300 es
precision highp float;
uniform sampler2D uPositionState;
uniform sampler2D uVelocityState;
${targets === 3 ? 'uniform sampler2D uMetadataState;' : ''}
uniform ivec2 uStateSize;
uniform int uParticleCapacity;
uniform vec2 uCanvasSize;
uniform float uPointScale;
out float vAge;
out float vSeed;
void main() {
  int index = gl_VertexID;
  ivec2 uv = ivec2(index % int(uStateSize.x), index / int(uStateSize.x));
  vec4 a = texelFetch(uPositionState, uv, 0);
  ${targets === 3 ? 'vec4 c = texelFetch(uMetadataState, uv, 0);' : 'vec4 c = vec4(0.0);'}
  if (index >= uParticleCapacity || a.w <= 0.0) { gl_Position=vec4(2.0); gl_PointSize=0.0; vAge=1.0; vSeed=0.0; return; }
  vAge = clamp(a.z / max(a.w, 0.0001), 0.0, 1.0);
  vSeed = c.z;
  vec2 clip = vec2(a.x / uCanvasSize.x * 2.0 - 1.0, 1.0 - a.y / uCanvasSize.y * 2.0);
  gl_Position = vec4(clip, 0.0, a.z < a.w ? 1.0 : 0.0);
  gl_PointSize = max(0.0, mix(uPointScale, 0.0, vAge));
  ${extensions.map((entry) => entry.glslRender ?? '').filter(Boolean).join('\n  ')}
}`;
}

function buildGlslFragment(extensions: readonly ParticleModuleCompilerExtension2D[]): string {
  return `#version 300 es
precision highp float;
uniform vec3 uPalette[8];
uniform int uPaletteCount;
uniform float uIntensity;
in float vAge;
in float vSeed;
out vec4 outColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float coverage = 1.0 - smoothstep(0.72, 1.0, length(p));
  int paletteIndex = int(floor(vSeed * float(max(1, uPaletteCount)))) % max(1, uPaletteCount);
  vec3 color = uPalette[paletteIndex];
  outColor = vec4(color * uIntensity, coverage * (1.0 - vAge));
  ${extensions.map((entry) => entry.glslRender ?? '').filter(Boolean).join('\n  ')}
}`;
}

function buildWgslSimulation(effect: CompiledParticleEffect2D, extensions: readonly ParticleModuleCompilerExtension2D[], collisions: boolean, turbulence: boolean): string {
  return `struct ParticleA { position: vec2<f32>, age: f32, lifetime: f32 }
struct ParticleB { velocity: vec2<f32>, rotation: f32, angularVelocity: f32 }
struct ParticleC { archetype: f32, generation: f32, colorSeed: f32, flags: f32 }
struct Frame { delta: f32, capacity: u32, viewport: vec2<f32>, commandCount: u32, commandTexels: u32, commandFrameStart: u32, padding: u32 }
@group(0) @binding(0) var<storage, read_write> stateA: array<ParticleA>;
@group(0) @binding(1) var<storage, read_write> stateB: array<ParticleB>;
@group(0) @binding(2) var<storage, read_write> stateC: array<ParticleC>;
@group(0) @binding(3) var<uniform> frame: Frame;
@group(0) @binding(4) var<storage, read> commandData: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read> archetypeMotion: array<vec4<f32>>;
fn hash11(value: f32) -> f32 { return fract(sin(value * 91.3458 + 17.123) * 47453.5453); }
@compute @workgroup_size(256)
fn simulate(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= frame.capacity) { return; }
  if (stateA[i].age < stateA[i].lifetime) {
    let archetype = min(u32(stateC[i].archetype + 0.5), ${Math.max(0, effect.source.archetypes.length - 1)}u);
    let motion = archetypeMotion[archetype];
    stateA[i].age += frame.delta;
    stateB[i].velocity.y += motion.x * frame.delta;
    stateB[i].velocity *= exp(-max(0.0, motion.y) * frame.delta);
    stateB[i].rotation += stateB[i].angularVelocity * frame.delta;
    stateA[i].position += stateB[i].velocity * frame.delta;
    ${collisions ? 'stateA[i].position = clamp(stateA[i].position, vec2<f32>(0.0), frame.viewport);' : ''}
  }
  ${turbulence ? '// Turbulence is generated from the stable color seed in the backend module.' : ''}
  if (frame.commandCount > 0u) {
    let candidate = (i + frame.capacity - frame.commandFrameStart) % frame.capacity;
    var low = 0u; var high = frame.commandCount;
    for (var iteration = 0u; iteration < 6u; iteration++) {
      let middle = (low + high) / 2u;
      if (middle >= frame.commandCount) { high = middle; }
      else if (u32(commandData[middle * frame.commandTexels].y + 0.5) <= candidate) { low = middle + 1u; }
      else { high = middle; }
    }
    if (low > 0u) {
      let commandIndex = low - 1u; let offset = commandIndex * frame.commandTexels; let a = commandData[offset];
      let relative = candidate - u32(a.y + 0.5); let count = u32(a.z + 0.5);
      if (relative < count) {
      let b = commandData[offset + 1u]; let c = commandData[offset + 2u]; let d = commandData[offset + 3u];
      let seed = d.x + f32(relative) * 1.6180339;
      let angle = c.x + (hash11(seed) - 0.5) * c.y;
      let power = c.z * mix(0.72, 1.28, hash11(seed + 2.0));
      stateA[i] = ParticleA(b.xy, 0.0, c.w * mix(max(0.05, 1.0-d.z), 1.0+d.z, hash11(seed+3.0)));
      stateB[i] = ParticleB(b.zw + vec2<f32>(cos(angle), sin(angle)) * power, 0.0, 0.0);
      stateC[i] = ParticleC(a.x, 0.0, d.y + hash11(seed+4.0), 0.0);
      }
    }
  }
  ${extensions.map((entry) => entry.wgslSimulation ?? '').filter(Boolean).join('\n  ')}
}`;
}

function buildWgslRender(): string {
  return `struct VertexOut { @builtin(position) position: vec4<f32>, @location(0) age: f32, @location(1) seed: f32 }
@vertex fn particleVertex(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> VertexOut {
  var out: VertexOut;
  let corner = array<vec2<f32>, 6>(vec2(-1.0,-1.0),vec2(1.0,-1.0),vec2(-1.0,1.0),vec2(-1.0,1.0),vec2(1.0,-1.0),vec2(1.0,1.0));
  out.position = vec4<f32>(corner[vertex], 0.0, 1.0);
  out.age = 0.0; out.seed = f32(instance); return out;
}`;
}

function compileRenderPasses(effect: CompiledParticleEffect2D): Readonly<Record<ParticleRenderTier2D, readonly CompiledParticleRenderPass2D[]>> {
  const output = { basic: [] as CompiledParticleRenderPass2D[], enhanced: [] as CompiledParticleRenderPass2D[], ultra: [] as CompiledParticleRenderPass2D[] };
  for (const recipe of effect.source.renderRecipes.recipes) {
    const passes = output[recipe.tier];
    if (recipe.points) passes.push({ id: `${recipe.tier}.points`, tier: recipe.tier, kind: 'points', blend: recipe.blend });
    if (recipe.streaks) passes.push({ id: `${recipe.tier}.streaks`, tier: recipe.tier, kind: 'streaks', blend: recipe.blend });
    if (recipe.trails) passes.push({ id: `${recipe.tier}.trails`, tier: recipe.tier, kind: 'trails', blend: recipe.blend });
    if (recipe.bloom) passes.push({ id: `${recipe.tier}.bloom`, tier: recipe.tier, kind: 'bloom', blend: 'additive' });
  }
  return Object.freeze({ basic: Object.freeze(output.basic), enhanced: Object.freeze(output.enhanced), ultra: Object.freeze(output.ultra) });
}

function baseBindings(targets: 2 | 3, collisions: boolean, events: boolean, extensions: readonly ParticleModuleCompilerExtension2D[]): ParticleShaderBinding2D[] {
  const bindings: ParticleShaderBinding2D[] = [
    { name: 'uPositionState', kind: 'texture', dataType: 'rgba32f', required: true },
    { name: 'uVelocityState', kind: 'texture', dataType: 'rgba32f', required: true },
    { name: 'uDt', kind: 'uniform', dataType: 'f32', required: true },
    { name: 'uCanvasSize', kind: 'uniform', dataType: 'vec2', required: true },
    { name: 'uArchetypeMotion', kind: 'uniform', dataType: 'vec4[]', required: true },
    { name: 'uPalette', kind: 'uniform', dataType: 'vec3[8]', required: true },
  ];
  if (targets === 3) bindings.push({ name: 'uMetadataState', kind: 'texture', dataType: 'rgba32f', required: true });
  if (collisions) bindings.push({ name: 'uColliders', kind: 'texture', dataType: 'rgba32f', required: false });
  if (events) bindings.push({ name: 'uEventCommands', kind: 'texture', dataType: 'rgba32f', required: false });
  extensions.forEach((extension) => { bindings.push(...(extension.bindings ?? [])); });
  return bindings;
}

function shader(backend: ParticleShaderBackend2D, stage: ParticleShaderStage2D, entryPoint: string, source: string): ParticleCompiledShader2D {
  return Object.freeze({ backend, stage, entryPoint, source, hash: hashSource(source) });
}

function hashSource(source: string): string {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function validateExtensions(extensions: readonly ParticleModuleCompilerExtension2D[]): void {
  const ids = new Set<string>();
  for (const extension of extensions) {
    if (!/^[a-z][a-z0-9-]*$/.test(extension.id) || ids.has(extension.id)) throw new Error(`Invalid or duplicate particle compiler extension: ${extension.id}`);
    if (extension.supports.length === 0) throw new Error(`Particle compiler extension ${extension.id} declares no compatible backend`);
    if (extension.supports.includes('webgl2') && !extension.glslSimulation && !extension.glslRender) throw new Error(`Particle compiler extension ${extension.id} is missing its GLSL implementation`);
    if (extension.supports.includes('webgpu') && !extension.wgslSimulation) throw new Error(`Particle compiler extension ${extension.id} is missing its WGSL implementation`);
    ids.add(extension.id);
  }
}

function validateRequiredExtensions(effect: CompiledParticleEffect2D, extensions: readonly ParticleModuleCompilerExtension2D[]): void {
  const available = new Map(extensions.map((extension) => [extension.id, extension]));
  for (const id of effect.source.customModules ?? []) {
    const extension = available.get(id);
    if (!extension) throw new Error(`Particle effect ${effect.source.id} requires unregistered compiler extension ${id}`);
    if (!extension.supports.includes('webgl2') && effect.fallbackPolicy === 'webgl2') throw new Error(`Particle extension ${id} cannot satisfy the WebGL2 fallback policy`);
  }
}

function wgslFloat(value: number): string { return Number.isInteger(value) ? `${value}.0` : String(value); }
