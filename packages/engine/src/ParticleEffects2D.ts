import type { GpuRenderTarget2D } from './Gpu2D.js';

export const PARTICLE_EFFECT_STATE_ABI_VERSION = 1;
export const PARTICLE_EFFECT_COMMAND_CAPACITY = 64;

export const PARTICLE_EFFECT_STATE_LAYOUT = Object.freeze({
  position: Object.freeze(['positionX', 'positionY', 'age', 'lifetime'] as const),
  motion: Object.freeze(['velocityX', 'velocityY', 'rotation', 'angularVelocity'] as const),
  metadata: Object.freeze(['archetypeId', 'generation', 'colorSeed', 'flags'] as const),
});

export type ParticleSpawnShape2D = 'point' | 'disc' | 'line' | 'cone' | 'arc' | 'ring' | 'radial' | 'spiral' | 'pinwheel' | 'shower';
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
  readonly tangentialAcceleration?: number;
  readonly inheritedVelocity?: number;
  readonly angularVelocity?: number;
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

export interface ParticleSettingBinding2D {
  readonly parameter: string;
  readonly persistedKey: string;
  readonly label: string;
  readonly section: string;
  readonly archetypeId?: string;
  readonly tiers?: readonly ParticleRenderTier2D[];
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
  for (const event of archetype.events ?? []) {
    if (!Number.isFinite(event.probability) || event.probability < 0 || event.probability > 1) throw new Error(`Particle event probability for ${archetype.id} must be between 0 and 1`);
    if (!Number.isSafeInteger(event.count) || event.count < 0) throw new Error(`Particle event count for ${archetype.id} must be a non-negative integer`);
    if (!Number.isSafeInteger(event.maxGeneration) || event.maxGeneration < 0) throw new Error(`Particle event generation limit for ${archetype.id} must be a non-negative integer`);
  }
}
