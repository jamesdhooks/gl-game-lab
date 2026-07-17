import type { GpuRenderTarget2D } from './Gpu2D.js';
import type { GpuParticleCommandBatch2D } from './Gpu2D.js';

export const PARTICLE_EFFECT_STATE_ABI_VERSION = 1;
export const PARTICLE_EFFECT_COMMAND_CAPACITY = 64;

export const PARTICLE_EFFECT_STATE_LAYOUT = Object.freeze({
  position: Object.freeze(['positionX', 'positionY', 'age', 'lifetime'] as const),
  motion: Object.freeze(['velocityX', 'velocityY', 'rotation', 'angularVelocity'] as const),
  metadata: Object.freeze(['archetypeId', 'generation', 'colorSeed', 'flags'] as const),
});

export type ParticleSpawnShape2D = 'point' | 'disc' | 'line' | 'cone' | 'arc' | 'ring' | 'radial' | 'spiral' | 'pinwheel' | 'shower' | 'annulus';
export type ParticleEventTrigger2D = 'birth' | 'age' | 'death' | 'collision';
export type ParticleBlendMode2D = 'opaque' | 'alpha' | 'additive' | 'multiply';
export type ParticleRenderTier2D = 'basic' | 'enhanced' | 'ultra';
export type ParticleSettingValue2D = number | string | boolean;

export interface ParticleCapacityPolicy2D {
  readonly default: number;
  readonly min: number;
  readonly max: number;
  readonly previewMax: number;
  readonly commandCapacity?: number;
}

export interface ParticleScalarCurve2D {
  readonly start: number;
  readonly end: number;
  readonly exponent?: number;
}

export interface ParticleSpawnProfile2D {
  readonly shape: ParticleSpawnShape2D;
  readonly spread: number;
  readonly radius?: number;
  readonly arc?: number;
  readonly direction?: number;
}

export interface ParticleMotionProfile2D {
  readonly gravity: number;
  readonly drag: number;
  readonly turbulence?: number;
  readonly radialAcceleration?: number;
  readonly radialFalloff?: 'constant' | 'inverse' | 'inverse-square';
  readonly tangentialAcceleration?: number;
  readonly inheritedVelocity?: number;
  readonly angularVelocity?: number;
  /** Optional logical-pixels-per-second ceiling applied after all forces. */
  readonly maxSpeed?: number;
}

export interface ParticleLifecycleProfile2D {
  readonly lifetime: number;
  readonly lifetimeVariability?: number;
  readonly activationDelay?: number;
  readonly killMargin?: number;
}

export interface ParticleAppearanceProfile2D {
  readonly size: ParticleScalarCurve2D;
  readonly alpha: ParticleScalarCurve2D;
  readonly intensity: ParticleScalarCurve2D;
  readonly length?: ParticleScalarCurve2D;
  readonly variability?: number;
  readonly flicker?: number;
  readonly afterglow?: number;
  readonly paletteMode?: 'seeded' | 'gradient' | 'generation' | 'terminal';
}

export interface ParticleCollisionProfile2D {
  readonly bounds?: boolean;
  readonly circles?: boolean;
  readonly capsules?: boolean;
  readonly restitution: number;
  readonly friction: number;
  readonly lifetimeLoss?: number;
}

export interface ParticleEventEmitter2D {
  readonly trigger: ParticleEventTrigger2D;
  readonly childArchetypeId: string;
  readonly probability: number;
  readonly count: number;
  readonly maxGeneration: number;
  readonly delay?: number;
  readonly velocityInheritance?: number;
  readonly powerScale?: number;
  readonly spread?: number;
  readonly priority?: 'primary' | 'secondary' | 'cosmetic';
}

export interface ParticleArchetype2D {
  readonly id: string;
  readonly spawn: ParticleSpawnProfile2D;
  readonly motion: ParticleMotionProfile2D;
  readonly lifecycle: ParticleLifecycleProfile2D;
  readonly appearance: ParticleAppearanceProfile2D;
  readonly collision?: ParticleCollisionProfile2D;
  readonly events?: readonly ParticleEventEmitter2D[];
}

export interface ParticleModuleSet2D {
  readonly motion: boolean;
  readonly lifecycle: boolean;
  readonly collisions?: boolean;
  readonly events?: boolean;
  readonly turbulence?: boolean;
  readonly rotation?: boolean;
}

export interface ParticleRenderRecipe2D {
  readonly tier: ParticleRenderTier2D;
  readonly points: boolean;
  readonly streaks?: boolean;
  readonly trails?: boolean;
  readonly bloom?: boolean;
  readonly blend: ParticleBlendMode2D;
}

export interface ParticleRenderRecipeSet2D {
  readonly defaultTier: ParticleRenderTier2D;
  readonly recipes: readonly ParticleRenderRecipe2D[];
}

export interface ParticleEffectDefinition2D {
  readonly id: string;
  readonly capacity: ParticleCapacityPolicy2D;
  readonly archetypes: readonly ParticleArchetype2D[];
  readonly modules: ParticleModuleSet2D;
  readonly renderRecipes: ParticleRenderRecipeSet2D;
}

export interface ParticleSpawnCommand2D {
  readonly archetypeId: string;
  readonly count: number;
  readonly position: readonly [number, number];
  readonly inheritedVelocity: readonly [number, number];
  readonly direction: number;
  readonly spread: number;
  readonly power: number;
  readonly seed: number;
  readonly paletteSeed: number;
  readonly shape?: ParticleSpawnShape2D;
  readonly lifetimeScale?: number;
  readonly lifetimeVariability?: number;
  /** Scene-defined spawn variant such as a burst-pattern index. */
  readonly variant?: number;
}

export type ParticleEffectParameters2D = Readonly<Record<string, ParticleSettingValue2D>>;

export interface ParticlePalette2D {
  readonly colors: readonly (readonly [number, number, number])[];
  readonly revision: number;
}

export interface ParticleEffectDiagnostics2D {
  readonly capacity: number;
  readonly activeEstimate: number;
  readonly queuedCommands: number;
  readonly droppedCommands: number;
  readonly spawnedParticles: number;
  readonly droppedParticles: number;
  readonly eventCount: number;
  readonly simulationPasses: number;
  readonly renderPasses: number;
  readonly uploadBytes: number;
  readonly contextGeneration: number;
  readonly rebuildCount: number;
  readonly diagnosticAccuracy?: 'exact' | 'delayed' | 'estimated';
  readonly directCommandsAdmitted?: number;
  readonly directCommandsTruncated?: number;
  readonly eventContentionLosses?: number;
  readonly eventGenerationDrops?: number;
  readonly eventCapacityDrops?: number;
  readonly trailPasses?: number;
  readonly bloomPasses?: number;
  readonly parameterUploadBytes?: number;
  readonly paletteUploadBytes?: number;
  readonly commandUploadBytes?: number;
  readonly cpuTimeMs?: number;
  readonly gpuTimeMs?: number;
  readonly allocationsAfterWarmup?: number;
  readonly pipelineCacheHits?: number;
  readonly archetypes?: Readonly<Record<string, Readonly<{ capacity: number; activeEstimate: number }>>>;
  readonly eventAttemptsByTrigger?: Readonly<Partial<Record<ParticleEventTrigger2D, number>>>;
  readonly eventAttemptsByPriority?: Readonly<Partial<Record<"primary" | "secondary" | "cosmetic", number>>>;
}

export interface ParticleEffectController2D {
  enqueue(command: ParticleSpawnCommand2D): void;
  updateParameters(parameters: ParticleEffectParameters2D): void;
  setPalette(palette: ParticlePalette2D): void;
  clear(): void;
  render(target: GpuRenderTarget2D): void;
  diagnostics(): ParticleEffectDiagnostics2D;
  dispose(): void;
}

export function particleDiagnosticsSummary2D(diagnostics: ParticleEffectDiagnostics2D): Readonly<Record<string, string | number | boolean>> {
  const summary: Record<string, string | number | boolean> = {
    capacity: diagnostics.capacity,
    activeEstimate: diagnostics.activeEstimate,
    queuedCommands: diagnostics.queuedCommands,
    droppedCommands: diagnostics.droppedCommands,
    spawnedParticles: diagnostics.spawnedParticles,
    droppedParticles: diagnostics.droppedParticles,
    eventCount: diagnostics.eventCount,
    simulationPasses: diagnostics.simulationPasses,
    renderPasses: diagnostics.renderPasses,
    uploadBytes: diagnostics.uploadBytes,
    contextGeneration: diagnostics.contextGeneration,
    rebuildCount: diagnostics.rebuildCount,
  };
  for (const [key, value] of Object.entries(diagnostics)) if ((typeof value === "string" || typeof value === "number" || typeof value === "boolean") && !(key in summary)) summary[key] = value;
  return Object.freeze(summary);
}

export interface ParticleSettingBinding2D {
  readonly parameter: string;
  readonly persistedKey: string;
  readonly label: string;
  readonly section: string;
  readonly archetypeId?: string;
  readonly tiers?: readonly ParticleRenderTier2D[];
}

export class ParticleCommandQueue2D {
  readonly data: Float32Array;
  private readonly archetypeIds = new Map<string, number>();
  private readonly stableBatch: GpuParticleCommandBatch2D;
  private queued = 0;
  private queuedParticles = 0;
  private drainCount = 0;
  private drainParticles = 0;
  private cursor = 0;
  private activeCapacity: number;
  private droppedCommands = 0;
  private droppedParticles = 0;

  constructor(readonly definition: ParticleEffectDefinition2D) {
    validateParticleEffectDefinition2D(definition);
    const commandCapacity = definition.capacity.commandCapacity ?? PARTICLE_EFFECT_COMMAND_CAPACITY;
    this.data = new Float32Array(commandCapacity * 16);
    this.activeCapacity = definition.capacity.default;
    definition.archetypes.forEach((archetype, index) => { this.archetypeIds.set(archetype.id, index); });
    const queue = this;
    this.stableBatch = Object.freeze({
      get data() { return queue.data; },
      get count() { return queue.drainCount; },
      get particleCount() { return queue.drainParticles; },
    });
  }

  get commandCapacity(): number { return this.data.length / 16; }
  get queuedCommands(): number { return this.queued; }
  get totalDroppedCommands(): number { return this.droppedCommands; }
  get totalDroppedParticles(): number { return this.droppedParticles; }

  setCapacity(capacity: number): void {
    if (!Number.isSafeInteger(capacity) || capacity < this.definition.capacity.min || capacity > this.definition.capacity.max) throw new Error('Particle command queue capacity is outside the effect policy');
    this.activeCapacity = capacity;
    this.cursor %= capacity;
  }

  enqueue(command: ParticleSpawnCommand2D): boolean {
    const archetypeId = this.archetypeIds.get(command.archetypeId);
    if (archetypeId === undefined) throw new Error(`Unknown particle archetype: ${command.archetypeId}`);
    if (!Number.isSafeInteger(command.count) || command.count < 0) throw new Error('Particle spawn count must be a non-negative integer');
    if (this.queued >= this.commandCapacity) {
      this.droppedCommands += 1;
      this.droppedParticles += command.count;
      return false;
    }
    const count = Math.min(command.count, this.activeCapacity);
    const offset = this.queued * 16;
    this.data[offset] = archetypeId;
    this.data[offset + 1] = this.cursor;
    this.data[offset + 2] = count;
    this.data[offset + 3] = particleSpawnShapeCode2D(command.shape ?? this.definition.archetypes[archetypeId]!.spawn.shape);
    this.data[offset + 4] = command.position[0];
    this.data[offset + 5] = command.position[1];
    this.data[offset + 6] = command.inheritedVelocity[0];
    this.data[offset + 7] = command.inheritedVelocity[1];
    this.data[offset + 8] = command.direction;
    this.data[offset + 9] = command.spread;
    this.data[offset + 10] = command.power;
    this.data[offset + 11] = command.lifetimeScale ?? this.definition.archetypes[archetypeId]!.lifecycle.lifetime;
    this.data[offset + 12] = command.seed;
    this.data[offset + 13] = command.paletteSeed;
    this.data[offset + 14] = command.lifetimeVariability ?? this.definition.archetypes[archetypeId]!.lifecycle.lifetimeVariability ?? 0;
    this.data[offset + 15] = command.variant ?? 0;
    this.cursor = (this.cursor + count) % this.activeCapacity;
    this.queued += 1;
    this.queuedParticles += count;
    return true;
  }

  drain(): GpuParticleCommandBatch2D {
    this.drainCount = this.queued;
    this.drainParticles = this.queuedParticles;
    this.queued = 0;
    this.queuedParticles = 0;
    return this.stableBatch;
  }

  reset(): void {
    this.queued = 0;
    this.queuedParticles = 0;
    this.drainCount = 0;
    this.drainParticles = 0;
    this.cursor = 0;
  }
}

export function particleSpawnShapeCode2D(shape: ParticleSpawnShape2D): number {
  const index = SPAWN_SHAPES.indexOf(shape);
  if (index < 0) throw new Error(`Unknown particle spawn shape: ${String(shape)}`);
  return index;
}

export function resolveParticleRenderRecipe2D(definition: ParticleEffectDefinition2D, tier?: ParticleRenderTier2D): ParticleRenderRecipe2D {
  const requested = tier ?? definition.renderRecipes.defaultTier;
  const recipe = definition.renderRecipes.recipes.find((candidate) => candidate.tier === requested);
  if (!recipe) throw new Error(`Particle effect ${definition.id} does not define render tier ${requested}`);
  return recipe;
}

export function validateParticleSettingBindings2D(definition: ParticleEffectDefinition2D, bindings: readonly ParticleSettingBinding2D[]): readonly ParticleSettingBinding2D[] {
  const persisted = new Set<string>();
  const archetypes = new Set(definition.archetypes.map((archetype) => archetype.id));
  for (const binding of bindings) {
    if (binding.parameter.trim().length === 0 || binding.persistedKey.trim().length === 0) throw new Error('Particle setting bindings require parameter and persisted keys');
    if (persisted.has(binding.persistedKey)) throw new Error(`Duplicate particle setting persisted key: ${binding.persistedKey}`);
    if (binding.archetypeId && !archetypes.has(binding.archetypeId)) throw new Error(`Particle setting binding references unknown archetype: ${binding.archetypeId}`);
    persisted.add(binding.persistedKey);
  }
  return Object.freeze(bindings);
}

export function validateParticleEffectDefinition2D(definition: ParticleEffectDefinition2D): ParticleEffectDefinition2D {
  if (definition.id.trim().length === 0) throw new Error('Particle effect id cannot be empty');
  validateCapacity(definition.capacity);
  if (definition.archetypes.length === 0) throw new Error(`Particle effect ${definition.id} requires at least one archetype`);
  const ids = new Set<string>();
  for (const archetype of definition.archetypes) {
    if (archetype.id.trim().length === 0 || ids.has(archetype.id)) throw new Error(`Particle effect ${definition.id} has an invalid or duplicate archetype id: ${archetype.id}`);
    ids.add(archetype.id);
    validateArchetype(archetype);
  }
  for (const archetype of definition.archetypes) {
    for (const event of archetype.events ?? []) {
      if (!ids.has(event.childArchetypeId)) throw new Error(`Particle archetype ${archetype.id} references unknown child archetype ${event.childArchetypeId}`);
    }
  }
  const tiers = new Set(definition.renderRecipes.recipes.map((recipe) => recipe.tier));
  if (!tiers.has(definition.renderRecipes.defaultTier)) throw new Error(`Particle effect ${definition.id} does not define its default render tier`);
  if (tiers.size !== definition.renderRecipes.recipes.length) throw new Error(`Particle effect ${definition.id} has duplicate render tiers`);
  return Object.freeze(definition);
}

function validateCapacity(capacity: ParticleCapacityPolicy2D): void {
  const values = [capacity.min, capacity.default, capacity.max, capacity.previewMax];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 1)) throw new Error('Particle effect capacities must be positive integers');
  if (capacity.min > capacity.default || capacity.default > capacity.max || capacity.previewMax > capacity.max) throw new Error('Particle effect capacity policy is inconsistent');
  const commandCapacity = capacity.commandCapacity ?? PARTICLE_EFFECT_COMMAND_CAPACITY;
  if (!Number.isSafeInteger(commandCapacity) || commandCapacity < 1 || commandCapacity > PARTICLE_EFFECT_COMMAND_CAPACITY) throw new Error(`Particle command capacity must be between 1 and ${PARTICLE_EFFECT_COMMAND_CAPACITY}`);
}

function validateArchetype(archetype: ParticleArchetype2D): void {
  if (!Number.isFinite(archetype.lifecycle.lifetime) || archetype.lifecycle.lifetime <= 0) throw new Error(`Particle archetype ${archetype.id} requires a positive lifetime`);
  if (!Number.isFinite(archetype.motion.drag) || archetype.motion.drag < 0) throw new Error(`Particle archetype ${archetype.id} requires non-negative drag`);
  if (archetype.motion.maxSpeed !== undefined && (!Number.isFinite(archetype.motion.maxSpeed) || archetype.motion.maxSpeed <= 0)) throw new Error(`Particle archetype ${archetype.id} requires a positive maximum speed`);
  for (const event of archetype.events ?? []) {
    if (!Number.isFinite(event.probability) || event.probability < 0 || event.probability > 1) throw new Error(`Particle event probability for ${archetype.id} must be between 0 and 1`);
    if (!Number.isSafeInteger(event.count) || event.count < 0) throw new Error(`Particle event count for ${archetype.id} must be a non-negative integer`);
    if (!Number.isSafeInteger(event.maxGeneration) || event.maxGeneration < 0) throw new Error(`Particle event generation limit for ${archetype.id} must be a non-negative integer`);
  }
}

const SPAWN_SHAPES: readonly ParticleSpawnShape2D[] = Object.freeze(['point', 'disc', 'line', 'cone', 'arc', 'ring', 'radial', 'spiral', 'pinwheel', 'shower', 'annulus']);
