import { DenseCircleParticleWorld2D } from '@hooksjam/gl-game-lab-physics-2d';
export interface LavaLampTuning {
  readonly gravity: number;
  readonly buoyancy: number;
  readonly thermalDrive: number;
  readonly heatRegion: number;
  readonly coolRegion: number;
  readonly heatRate: number;
  readonly coolRate: number;
  readonly heatTransfer: number;
  readonly turbulence: number;
  readonly verticalTurbulence: number;
  readonly waxViscosity: number;
  readonly surfaceTension: number;
  readonly clumping: number;
  readonly substeps: number;
  readonly maxParticles: number;
  readonly blobRadius: number;
}
export class LavaLampModel {
  readonly world = new DenseCircleParticleWorld2D(1024, {
    maxParticles: 1024,
    gravity: 0,
    openTop: false
  }, 444209786);
  readonly temperatures = new Float32Array(1024);
  private elapsed = 0;
  reset(width: number, height: number, initial: number, tuning: LavaLampTuning, seed = 444209786) {
    this.world.clear(seed);
    this.world.setBounds(width, height);
    this.elapsed = 0;
    this.configure(tuning);
    const count = Math.min(tuning.maxParticles, Math.max(0, Math.floor(initial)));
    const clusterCount = Math.max(4, Math.min(12, Math.round(Math.sqrt(count) * 0.9)));
    for (let i = 0; i < count; i++) {
      const cluster = i % clusterCount;
      const centerX = tuning.blobRadius * 2 + randomHash(cluster * 101 + seed) * Math.max(1, width - tuning.blobRadius * 4);
      const centerY = height * (0.58 + randomHash(cluster * 109 + seed) * 0.34);
      const angle = randomHash(i * 17 + seed) * Math.PI * 2;
      const spread = Math.sqrt(randomHash(i * 31 + seed)) * tuning.blobRadius * 1.55;
      const x = centerX + Math.cos(angle) * spread, y = centerY + Math.sin(angle) * spread * 0.82;
      const temperature = Math.min(0.72, 0.18 + ((centerY / Math.max(1, height) - 0.58) / 0.34) * 0.3 + randomHash(cluster * 7 + seed) * 0.13 + (cluster === 0 ? 0.24 : 0));
      this.add(x, y, tuning, temperature, (randomHash(i * 11 + seed) - 0.5) * 25);
    }
  }
  configure(tuning: LavaLampTuning) {
    this.world.configure({
      maxParticles: Math.max(1, Math.min(1024, Math.floor(tuning.maxParticles))),
      // The source simulation treats blobRadius as a metaball kernel, not a
      // hard-circle collision radius. A smaller collision core lets wax merge
      // into coherent packets without packing the entire lamp solid.
      radius: tuning.blobRadius * 0.34,
      radiusVariation: 0.28,
      gravity: 0,
      solverIterations: 3,
      substeps: Math.max(1, Math.min(4, Math.floor(tuning.substeps))),
      collisionSoftness: 0.55 + tuning.surfaceTension * 0.65,
      contactFriction: Math.min(2, tuning.waxViscosity * 0.18),
      solverDamping: Math.max(0.78, 0.998 - tuning.waxViscosity * 0.018),
      airDrag: Math.max(0.82, 0.999 - tuning.waxViscosity * 0.012),
      openTop: false,
      wallBounce: false
    });
  }
  add(x: number, y: number, tuning: LavaLampTuning, temperature = 1, velocityY = -80) {
    const index = this.world.addCircle(x, y, {
      radiusNoise: randomHash(this.world.count * 17 + this.elapsed * 1000) * 2 - 1,
      velocityX: (randomHash(this.world.count * 31 + 9) - 0.5) * 35,
      velocityY,
      colorSeed: this.world.count
    });
    if (index >= 0)
      this.temperatures[index] = clamp(temperature);
    return index;
  }
  remove(x: number, y: number, radius: number) {
    const removed = this.world.removeWithin(x, y, radius);
    if (removed > 0)
      for (let i = 0; i < this.world.count; i++)
        this.temperatures[i] = clamp(0.25 + (1 - (this.world.positions[i * 2 + 1] ?? 0) / 600) * 0.45);
    return removed;
  }
  heat(x: number, y: number, radius: number, amount: number, lift: number) {
    const radius2 = radius * radius;
    for (let i = 0; i < this.world.count; i++) {
      const o = i * 2, dx = (this.world.positions[o] ?? 0) - x, dy = (this.world.positions[o + 1] ?? 0) - y, d2 = dx * dx + dy * dy;
      if (d2 > radius2)
        continue;
      const influence = 1 - Math.sqrt(d2) / radius;
      this.temperatures[i] = clamp((this.temperatures[i] ?? 0) + amount * influence);
      this.world.velocities[o + 1] = (this.world.velocities[o + 1] ?? 0) - lift * influence;
    }
  }
  step(dt: number, width: number, height: number, tuning: LavaLampTuning) {
    this.elapsed += dt;
    this.world.setBounds(width, height);
    this.configure(tuning);
    const count = this.world.count;
    for (let i = 0; i < count; i++) {
      const o = i * 2, x = this.world.positions[o] ?? 0, y = this.world.positions[o + 1] ?? 0, normalized = y / Math.max(1, height);
      let temperature = this.temperatures[i] ?? 0.5;
      if (normalized > 1 - tuning.heatRegion)
        temperature += tuning.heatRate * dt;
      if (normalized < tuning.coolRegion)
        temperature -= tuning.coolRate * dt;
      const neighbor = (i + 1) % Math.max(1, count), exchange = ((this.temperatures[neighbor] ?? temperature) - temperature) * tuning.heatTransfer * dt * 12;
      temperature = clamp(temperature + exchange);
      this.temperatures[i] = temperature;
      const buoyant = tuning.buoyancy * Math.max(0, temperature - 0.28) * tuning.thermalDrive, phaseX = x * 0.008 + this.elapsed * 0.21, phaseY = y * 0.006 - this.elapsed * 0.17, coherent = Math.sin(phaseX + Math.sin(phaseY * 1.3)) * 0.64 + Math.sin(phaseY * 0.73 + phaseX * 0.31) * 0.36;
      this.world.velocities[o] = (this.world.velocities[o] ?? 0) + coherent * tuning.turbulence * (8 + temperature * 18) * dt;
      this.world.velocities[o + 1] = (this.world.velocities[o + 1] ?? 0) + (tuning.gravity - buoyant + Math.cos(phaseX * 0.57 - phaseY) * tuning.verticalTurbulence * 16) * dt;
      const damping = Math.exp(-tuning.waxViscosity * dt * 0.42);
      this.world.velocities[o] = (this.world.velocities[o] ?? 0) * damping;
      this.world.velocities[o + 1] = (this.world.velocities[o + 1] ?? 0) * damping;
      for (let n = 1; n <= 3 && n < count; n++) {
        const j = (i + n) % count, jo = j * 2, dx = (this.world.positions[jo] ?? 0) - x, dy = (this.world.positions[jo + 1] ?? 0) - y, distance = Math.hypot(dx, dy), limit = tuning.blobRadius * 5;
        if (distance > 1 && distance < limit) {
          const pull = (1 - distance / limit) * tuning.clumping * 5 * dt;
          this.world.velocities[o] = (this.world.velocities[o] ?? 0) + dx / distance * pull;
          this.world.velocities[o + 1] = (this.world.velocities[o + 1] ?? 0) + dy / distance * pull;
        }
      }
    }
    this.world.step(dt);
  }
  get count() {
    return this.world.count;
  }
}
function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
function randomHash(value: number) {
  return Math.abs(Math.sin(value * 12.9898) * 43758.5453) % 1;
}
