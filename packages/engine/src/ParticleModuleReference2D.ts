import type { ParticleCollisionProfile2D, ParticleMotionProfile2D, ParticleScalarCurve2D, ParticleSpawnShape2D } from "./ParticleEffects2D.js";
import type { ParticleAttractor2D, ParticleCapsuleCollider2D, ParticleCircleCollider2D, ParticleDomain2D } from "./ParticleEffectRuntime2D.js";

export interface ParticleReferenceState2D {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  lifetime: number;
  rotation: number;
  angularVelocity: number;
}
export interface ParticleReferenceSpawn2D {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export interface ParticleReferenceIntegrationContext2D {
  readonly colorSeed?: number;
  readonly turbulenceBackend?: "webgl2" | "webgpu";
}

export function integrateParticleReference2D(state: ParticleReferenceState2D, motion: ParticleMotionProfile2D, delta: number, attractor?: ParticleAttractor2D | readonly ParticleAttractor2D[], context: ParticleReferenceIntegrationContext2D = {}): void {
  state.age += delta;
  state.vy += motion.gravity * delta;
  const damping = Math.exp(-Math.max(0, motion.drag) * delta);
  state.vx *= damping;
  state.vy *= damping;
  const attractors = attractor === undefined ? [] : Array.isArray(attractor) ? attractor : [attractor];
  for (const field of attractors) {
    if ((motion.radialAcceleration ?? 0) === 0 && (motion.tangentialAcceleration ?? 0) === 0 && (field.velocityCoupling ?? 0) === 0 && (field.radialStrength ?? 0) === 0 && (field.tangentialStrength ?? 0) === 0) continue;
    const dx = field.x - state.x,
      dy = field.y - state.y,
      rawLength = Math.hypot(dx, dy),
      length = Math.max(field.softening ?? 1, rawLength, 1e-6),
      nx = rawLength > 1e-6 ? dx / rawLength : 0,
      ny = rawLength > 1e-6 ? dy / rawLength : 0;
    const radius = field.radius ?? 0;
    if (radius > 0 && rawLength >= radius) continue;
    const envelope = forceEnvelope(field, rawLength),
      mode = field.falloff ?? motion.radialFalloff,
      falloff = mode === "inverse-square" ? 1 / (length * length) : mode === "inverse" ? 1 / length : 1;
    const radial = (motion.radialAcceleration ?? 0) * field.strength + (field.radialStrength ?? 0),
      tangential = (motion.tangentialAcceleration ?? 0) * field.strength + (field.tangentialStrength ?? 0);
    state.vx += ((nx * radial - ny * tangential) * falloff + (field.velocity?.[0] ?? 0) * (field.velocityCoupling ?? 0)) * envelope * delta;
    state.vy += ((ny * radial + nx * tangential) * falloff + (field.velocity?.[1] ?? 0) * (field.velocityCoupling ?? 0)) * envelope * delta;
  }
  applyMotionTail(state, motion, delta, context);
}

function applyMotionTail(state: ParticleReferenceState2D, motion: ParticleMotionProfile2D, delta: number, context: ParticleReferenceIntegrationContext2D): void {
  const turbulence = motion.turbulence ?? 0;
  if (turbulence !== 0) {
    const noise = context.turbulenceBackend === "webgl2"
      ? fract(Math.sin((state.x + (context.colorSeed ?? 0)) * 127.1 + (state.y + (context.colorSeed ?? 0)) * 311.7) * 43758.5453123)
      : fract(Math.sin(((context.colorSeed ?? 0) + state.age * 1.37 + state.x * 0.013 + state.y * 0.017) * 91.3458 + 17.123) * 47453.5453);
    const angle = noise * Math.PI * 2;
    state.vx += Math.cos(angle) * turbulence * delta;
    state.vy += Math.sin(angle) * turbulence * delta;
  }
  const speed = Math.hypot(state.vx, state.vy),
    maxSpeed = motion.maxSpeed ?? 0;
  if (maxSpeed > 0 && speed > maxSpeed) {
    state.vx *= maxSpeed / speed;
    state.vy *= maxSpeed / speed;
  }
  state.rotation += (state.angularVelocity + (motion.angularVelocity ?? 0)) * delta;
  state.x += state.vx * delta;
  state.y += state.vy * delta;
}

function fract(value: number): number {
  return value - Math.floor(value);
}
function forceEnvelope(attractor: ParticleAttractor2D, distance: number): number {
  const radius = attractor.radius ?? 0;
  if (radius <= 0 || attractor.envelope === "none") return 1;
  const t = Math.max(0, Math.min(1, 1 - distance / radius));
  return attractor.envelope === "smooth" ? t * t * (3 - 2 * t) : t;
}

export function applyParticleDomainReference2D(state: ParticleReferenceState2D, domain: ParticleDomain2D): void {
  if (domain.behavior === "none") return;
  const damping = domain.damping ?? 1,
    margin = domain.margin ?? 0;
  if (domain.shape === "circle") {
    const dx = state.x - domain.center[0],
      dy = state.y - domain.center[1],
      distance = Math.hypot(dx, dy),
      radius = (domain.radius ?? 0) + margin;
    if (distance <= radius) return;
    const nx = distance > 1e-6 ? dx / distance : 1,
      ny = distance > 1e-6 ? dy / distance : 0;
    if (domain.behavior === "kill") {
      state.age = state.lifetime;
      return;
    }
    if (domain.behavior === "wrap") {
      state.x = domain.center[0] - nx * (domain.radius ?? 0);
      state.y = domain.center[1] - ny * (domain.radius ?? 0);
      state.vx *= damping;
      state.vy *= damping;
      return;
    }
    const dot = state.vx * nx + state.vy * ny;
    state.x = domain.center[0] + nx * (domain.radius ?? 0);
    state.y = domain.center[1] + ny * (domain.radius ?? 0);
    state.vx = (state.vx - 2 * nx * dot) * damping;
    state.vy = (state.vy - 2 * ny * dot) * damping;
    return;
  }
  const extents = domain.halfExtents ?? [0, 0],
    minX = domain.center[0] - extents[0] - margin,
    maxX = domain.center[0] + extents[0] + margin,
    minY = domain.center[1] - extents[1] - margin,
    maxY = domain.center[1] + extents[1] + margin;
  if (state.x >= minX && state.x <= maxX && state.y >= minY && state.y <= maxY) return;
  if (domain.behavior === "kill") {
    state.age = state.lifetime;
    return;
  }
  if (domain.behavior === "wrap") {
    if (state.x < minX) state.x = maxX;
    else if (state.x > maxX) state.x = minX;
    if (state.y < minY) state.y = maxY;
    else if (state.y > maxY) state.y = minY;
    state.vx *= damping;
    state.vy *= damping;
    return;
  }
  if (state.x < minX || state.x > maxX) {
    state.x = Math.max(minX, Math.min(maxX, state.x));
    state.vx = -state.vx * damping;
  }
  if (state.y < minY || state.y > maxY) {
    state.y = Math.max(minY, Math.min(maxY, state.y));
    state.vy = -state.vy * damping;
  }
}

export function sampleParticleSpawnReference2D(shape: ParticleSpawnShape2D | "rectangle", index: number, count: number, randomA: number, randomB: number, radius: number, length: number, arc: number, direction: number, spread: number): ParticleReferenceSpawn2D {
  let angle = direction + (randomA - 0.5) * spread,
    x = 0,
    y = 0;
  if (shape === "disc") {
    const a = randomA * Math.PI * 2,
      r = Math.sqrt(randomB) * radius;
    x = Math.cos(a) * r;
    y = Math.sin(a) * r;
  } else if (shape === "line") {
    x = Math.cos(direction) * (randomA - 0.5) * length;
    y = Math.sin(direction) * (randomA - 0.5) * length;
  } else if (shape === "arc" || shape === "ring") {
    angle = direction + (randomA - 0.5) * (shape === "ring" ? Math.PI * 2 : arc);
    x = Math.cos(angle) * radius;
    y = Math.sin(angle) * radius;
  } else if (shape === "radial") angle = direction + randomA * Math.PI * 2;
  else if (shape === "spiral") angle = direction + Math.PI * 2 * (index / Math.max(1, count)) * Math.max(1, arc / (Math.PI * 2)) + (randomB - 0.5) * spread;
  else if (shape === "pinwheel") angle = direction + (index % 4) * Math.PI * 0.5 + index * 0.075 + (randomA - 0.5) * spread;
  else if (shape === "shower") {
    x = (randomA - 0.5) * length;
    angle = direction + (randomB - 0.5) * spread;
  } else if (shape === "annulus") {
    const a = randomA * Math.PI * 2,
      r = Math.sqrt(Math.max(0, length * length + (radius * radius - length * length) * randomB));
    x = Math.cos(a) * r;
    y = Math.sin(a) * r;
    angle = a;
  } else if (shape === "rectangle") {
    x = (randomA - 0.5) * radius * 2;
    y = (randomB - 0.5) * length * 2;
  }
  return Object.freeze({ x, y, angle });
}

export function collideCircleReference2D(state: ParticleReferenceState2D, collider: ParticleCircleCollider2D, profile: ParticleCollisionProfile2D): boolean {
  const dx = state.x - collider.x,
    dy = state.y - collider.y,
    distance = Math.hypot(dx, dy);
  if (distance >= collider.radius) return false;
  if (collider.mode === "kill") {
    state.age = state.lifetime;
    return true;
  }
  const nx = distance > 1e-6 ? dx / distance : 0,
    ny = distance > 1e-6 ? dy / distance : -1,
    dot = state.vx * nx + state.vy * ny;
  state.x = collider.x + nx * collider.radius;
  state.y = collider.y + ny * collider.radius;
  state.vx = (state.vx - nx * (1 + profile.restitution) * dot) * (1 - profile.friction);
  state.vy = (state.vy - ny * (1 + profile.restitution) * dot) * (1 - profile.friction);
  state.age += state.lifetime * (profile.lifetimeLoss ?? 0);
  return true;
}

export function collideCapsuleReference2D(state: ParticleReferenceState2D, collider: ParticleCapsuleCollider2D, profile: ParticleCollisionProfile2D): boolean {
  const abx = collider.bx - collider.ax,
    aby = collider.by - collider.ay,
    denominator = Math.max(1e-8, abx * abx + aby * aby);
  const t = Math.max(0, Math.min(1, ((state.x - collider.ax) * abx + (state.y - collider.ay) * aby) / denominator));
  return collideCircleReference2D(
    state,
    {
      x: collider.ax + abx * t,
      y: collider.ay + aby * t,
      radius: collider.radius,
      ...(collider.mode ? { mode: collider.mode } : {}),
    },
    profile,
  );
}

export function evaluateParticleScalarCurve2D(curve: ParticleScalarCurve2D, age: number): number {
  return curve.start + (curve.end - curve.start) * Math.pow(Math.max(0, Math.min(1, age)), curve.exponent ?? 1);
}

export function allocateParticleEventClaims2D(
  claims: readonly {
    readonly target: number;
    readonly priority: number;
    readonly parent: number;
  }[],
  capacity: number,
): Int32Array {
  const winners = new Int32Array(capacity);
  winners.fill(-1);
  const ranks = new Float64Array(capacity);
  ranks.fill(-1);
  for (const claim of claims) {
    if (claim.target < 0 || claim.target >= capacity) continue;
    const rank = claim.priority * (capacity + 1) + claim.parent;
    if (rank > ranks[claim.target]!) {
      ranks[claim.target] = rank;
      winners[claim.target] = claim.parent;
    }
  }
  return winners;
}
