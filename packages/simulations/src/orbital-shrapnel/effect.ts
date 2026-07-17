import { compileParticleEffect2D, compileParticleProgram2D, defineParticleEffect2D, particleGraph2D, validateParticleEffectDefinition2D, type ParticleEffectDefinition2D } from "@hooksjam/gl-game-lab-engine";

export const ORBITAL_SHRAPNEL_PARTICLE_EFFECT: ParticleEffectDefinition2D = validateParticleEffectDefinition2D({
  id: "orbital-shrapnel",
  capacity: {
    min: 64 * 64,
    default: 256 * 256,
    max: 2048 * 2048,
    previewMax: 128 * 128,
    commandCapacity: 64,
  },
  archetypes: [
    {
      id: "debris",
      spawn: { shape: "disc", spread: Math.PI * 2, radius: 32 },
      motion: {
        gravity: 0,
        drag: 0.0016,
        inheritedVelocity: 0.35,
        radialAcceleration: 1850,
        radialFalloff: "inverse-square",
        maxSpeed: 540,
      },
      lifecycle: { lifetime: 120, lifetimeVariability: 0.3, killMargin: 256 },
      appearance: {
        size: { start: 1, end: 0.7 },
        alpha: { start: 1, end: 0 },
        intensity: { start: 1, end: 0.5 },
        length: { start: 1, end: 0.5 },
        paletteMode: "seeded",
      },
      collision: { circles: true, restitution: 0, friction: 0 },
    },
    {
      id: "asteroid",
      spawn: { shape: "disc", spread: 0.12, radius: 12 },
      motion: {
        gravity: 0,
        drag: 0.0016,
        inheritedVelocity: 1,
        radialAcceleration: 1850,
        radialFalloff: "inverse-square",
      },
      lifecycle: { lifetime: 120, lifetimeVariability: 0.1, killMargin: 256 },
      appearance: {
        size: { start: 2.2, end: 1.3 },
        alpha: { start: 1, end: 0 },
        intensity: { start: 1.5, end: 0.6 },
        length: { start: 1.2, end: 0.5 },
        paletteMode: "seeded",
      },
      collision: { circles: true, restitution: 0, friction: 0 },
    },
  ],
  modules: { motion: true, lifecycle: true, collisions: true },
  renderRecipes: {
    defaultTier: "ultra",
    recipes: [
      { tier: "basic", points: true, blend: "additive" },
      { tier: "enhanced", points: true, streaks: true, blend: "additive" },
      {
        tier: "ultra",
        points: true,
        streaks: true,
        trails: true,
        bloom: true,
        blend: "additive",
      },
    ],
  },
});

export const ORBITAL_SHRAPNEL_PARTICLE_GRAPH = defineParticleEffect2D({
  schemaVersion: 1,
  id: "orbital-shrapnel",
  parameters: [
    {
      id: "planet-gravity",
      kind: "number",
      defaultValue: 1850,
      min: 0,
      max: 3200,
    },
    { id: "planet-radius", kind: "number", defaultValue: 46, min: 22, max: 92 },
    {
      id: "gravity-force",
      kind: "number",
      defaultValue: 60_000_000,
      min: 0,
      max: 1_000_000_000_000,
    },
    { id: "drag", kind: "number", defaultValue: 0.0016, min: 0, max: 4 },
    {
      id: "max-speed",
      kind: "number",
      defaultValue: 828,
      min: 1,
      max: 100_000,
    },
    {
      id: "debris-size",
      kind: "number",
      defaultValue: 0.72,
      min: 0.05,
      max: 5,
    },
    { id: "debris-opacity", kind: "number", defaultValue: 1, min: 0, max: 1 },
    {
      id: "streak-strength",
      kind: "number",
      defaultValue: 0.75,
      min: 0,
      max: 1.5,
    },
  ],
  archetypes: ORBITAL_SHRAPNEL_PARTICLE_EFFECT.archetypes,
  emitters: [
    {
      id: "debris-field",
      archetypeId: "debris",
      timeline: { manual: true },
      source: { kind: "annulus", innerRadius: 82, radius: 300 },
      initialization: {
        directionMode: "tangent-ccw",
        radialPowerExponent: -0.5,
        powerVariability: 0.08,
      },
      transform: { space: "scene" },
      limits: { importance: "primary", maxPerFrame: 262_144 },
    },
    {
      id: "debris-add",
      archetypeId: "debris",
      timeline: { manual: true },
      source: { kind: "disc", radius: 32 },
      transform: { space: "scene" },
      inheritance: { velocity: 1, palette: true, seed: true },
      limits: { importance: "primary", maxPerFrame: 262_144 },
    },
    {
      id: "asteroid-stream",
      archetypeId: "asteroid",
      timeline: { manual: true },
      source: { kind: "cone", spread: 0.12 },
      transform: { space: "scene" },
      inheritance: { velocity: 1, palette: true, seed: true },
      limits: { importance: "critical", maxPerFrame: 65_536 },
    },
  ],
  graph: {
    root: particleGraph2D.parallel(particleGraph2D.gate({ kind: "signal", signal: "add-debris" }, particleGraph2D.emit("debris-field")), particleGraph2D.gate({ kind: "signal", signal: "add-local-debris" }, particleGraph2D.emit("debris-add")), particleGraph2D.gate({ kind: "signal", signal: "launch-asteroid" }, particleGraph2D.emit("asteroid-stream"))),
  },
  renderRecipes: ORBITAL_SHRAPNEL_PARTICLE_EFFECT.renderRecipes,
  capacity: ORBITAL_SHRAPNEL_PARTICLE_EFFECT.capacity,
  quality: {
    defaultTier: "ultra",
    allowRuntimeScaling: true,
    targetFrameMs: 16.67,
  },
  persistedBindings: [
    { parameterId: "planet-gravity", key: "gravity" },
    { parameterId: "planet-radius", key: "planetRadius" },
  ],
  moduleBindings: [
    {
      target: "archetype.debris.motion.radialAcceleration",
      parameterId: "gravity-force",
    },
    {
      target: "archetype.asteroid.motion.radialAcceleration",
      parameterId: "gravity-force",
    },
    { target: "archetype.debris.motion.drag", parameterId: "drag" },
    { target: "archetype.asteroid.motion.drag", parameterId: "drag" },
    { target: "archetype.debris.motion.maxSpeed", parameterId: "max-speed" },
    { target: "archetype.asteroid.motion.maxSpeed", parameterId: "max-speed" },
    {
      target: "archetype.debris.appearance.size.start",
      parameterId: "debris-size",
    },
    {
      target: "archetype.debris.appearance.alpha.start",
      parameterId: "debris-opacity",
    },
    {
      target: "archetype.debris.appearance.length.start",
      parameterId: "streak-strength",
      scale: 2,
    },
  ],
  archetypeCapacity: [
    { archetypeId: "debris", share: 0.98, overflow: "recycle-oldest" },
    {
      archetypeId: "asteroid",
      share: 0.02,
      reserved: 1,
      overflow: "reserve-priority",
    },
  ],
});

export const ORBITAL_SHRAPNEL_PARTICLE_PROGRAM = compileParticleProgram2D(compileParticleEffect2D(ORBITAL_SHRAPNEL_PARTICLE_GRAPH));
