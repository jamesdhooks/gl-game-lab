const GRAVITY_SCALE = 1 / 2250;
const GRAVITY_SOFTENING = 0.075;

export interface OrbitalVelocity {
  readonly vx: number;
  readonly vy: number;
  readonly speed: number;
}

export function orbitalGravityWorld(gravity: number): number {
  return gravity * GRAVITY_SCALE;
}

export function debrisSpawnCount(capacity: number, volume: number): number {
  const safeCapacity = Math.max(1, Math.floor(capacity));
  return Math.max(1, Math.min(safeCapacity, Math.round(safeCapacity * Math.max(0, volume))));
}

export function stableOrbitalVelocity(
  x: number,
  y: number,
  aspect: number,
  gravity: number,
  minimumRadius = 0.035,
): OrbitalVelocity {
  const safeAspect = Math.max(0.001, aspect);
  const diskX = x / safeAspect;
  const radius = Math.max(minimumRadius, Math.hypot(diskX, y));
  const unitX = diskX / radius;
  const unitY = y / radius;
  const speed = Math.sqrt((gravity / (radius * radius + GRAVITY_SOFTENING)) * radius);
  return {
    vx: -unitY * speed * safeAspect,
    vy: unitX * speed,
    speed,
  };
}

export function asteroidLaunchVelocity(
  x: number,
  y: number,
  dx: number,
  dy: number,
  gravity: number,
  planetRadius: number,
  maxSpeed: number,
): { readonly vx: number; readonly vy: number } {
  const radius = Math.max(planetRadius + 0.055, Math.hypot(x, y));
  const orbitSpeed = Math.sqrt((gravity / (radius * radius + GRAVITY_SOFTENING)) * radius);
  const rawDistance = Math.hypot(dx, dy);
  if (rawDistance <= 0.0001) return { vx: 0, vy: 0 };
  const dragDistance = Math.min(1.25, rawDistance);
  const launchSpeed = Math.min(Math.max(0.05, maxSpeed * 0.96), orbitSpeed * (0.3 + dragDistance * 3.2));
  return {
    vx: dx / rawDistance * launchSpeed,
    vy: dy / rawDistance * launchSpeed,
  };
}
