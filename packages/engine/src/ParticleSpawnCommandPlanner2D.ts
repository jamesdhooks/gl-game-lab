/** Versioned float layout shared by the WebGL2 and WebGPU spawn backends. */
export const PARTICLE_SPAWN_COMMAND_FLOATS_2D = 16;

export interface ParticleSpawnCommandPlanResult2D {
  readonly commandCount: number;
  readonly droppedParticles: number;
  readonly truncatedCommands: number;
}

/** Splits commands at pool wraps, assigns absolute targets, then sorts for shader lookup. */
export function planParticleSpawnCommands2D(
  source: Float32Array,
  sourceCount: number,
  target: Float32Array,
  targetCapacity: number,
  pools: Float32Array,
  cursors: Int32Array,
): ParticleSpawnCommandPlanResult2D {
  let commandCount = 0, droppedParticles = 0, truncatedCommands = 0;
  for (let index = 0; index < sourceCount; index += 1) {
    const sourceOffset = index * PARTICLE_SPAWN_COMMAND_FLOATS_2D;
    const archetype = Math.max(0, Math.round(source[sourceOffset] ?? 0));
    const poolOffset = archetype * 4, poolStart = Math.round(pools[poolOffset] ?? 0);
    const poolCount = Math.max(1, Math.round(pools[poolOffset + 1] ?? 1)), poolEnd = poolStart + poolCount;
    let destination = cursors[archetype] ?? poolStart;
    let remaining = Math.max(0, Math.round(source[sourceOffset + 2] ?? 0)), relativeBase = 0;
    while (remaining > 0 && commandCount < targetCapacity) {
      const segmentCount = Math.min(remaining, poolEnd - destination);
      const targetOffset = commandCount * PARTICLE_SPAWN_COMMAND_FLOATS_2D;
      for (let component = 0; component < PARTICLE_SPAWN_COMMAND_FLOATS_2D; component += 1) target[targetOffset + component] = source[sourceOffset + component]!;
      target[targetOffset + 1] = destination; target[targetOffset + 2] = segmentCount; target[targetOffset + 13] = relativeBase;
      commandCount += 1; remaining -= segmentCount; relativeBase += segmentCount;
      destination = remaining > 0 ? poolStart : destination + segmentCount;
    }
    if (remaining > 0) { droppedParticles += remaining; truncatedCommands += 1; }
    cursors[archetype] = destination >= poolEnd ? poolStart : destination;
  }
  sortByAbsoluteTarget(target, commandCount);
  return Object.freeze({ commandCount, droppedParticles, truncatedCommands });
}

function sortByAbsoluteTarget(commands: Float32Array, count: number): void {
  for (let index = 1; index < count; index += 1) {
    let current = index;
    while (current > 0) {
      const left = (current - 1) * PARTICLE_SPAWN_COMMAND_FLOATS_2D, right = current * PARTICLE_SPAWN_COMMAND_FLOATS_2D;
      if (commands[left + 1]! <= commands[right + 1]!) break;
      for (let component = 0; component < PARTICLE_SPAWN_COMMAND_FLOATS_2D; component += 1) {
        const value = commands[left + component]!; commands[left + component] = commands[right + component]!; commands[right + component] = value;
      }
      current -= 1;
    }
  }
}
