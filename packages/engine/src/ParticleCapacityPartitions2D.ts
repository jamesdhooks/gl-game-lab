import type { CompiledParticleEffect2D, ParticleOverflowPolicy2D } from './ParticleEffectGraph2D.js';

export interface ParticleArchetypePartition2D {
  readonly archetypeId: string;
  readonly archetypeIndex: number;
  readonly start: number;
  readonly count: number;
  readonly overflow: ParticleOverflowPolicy2D;
}

/** Resolves graph shares and reservations into deterministic contiguous pools. */
export function resolveParticleArchetypePartitions2D(
  effect: CompiledParticleEffect2D,
  capacity: number,
): readonly ParticleArchetypePartition2D[] {
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new Error('Particle partition capacity must be a positive integer');
  }
  const policies = effect.archetypeCapacity;
  const counts = new Int32Array(policies.length);
  let allocated = 0;
  for (let index = 0; index < policies.length; index += 1) {
    const policy = policies[index]!;
    const count = Math.max(policy.reserved ?? 0, Math.floor(policy.share * capacity));
    counts[index] = count;
    allocated += count;
  }
  if (allocated > capacity) {
    throw new Error(`Particle archetype reservations require ${allocated} slots but capacity is ${capacity}`);
  }

  const priorityIndices = policies
    .map((policy, index) => ({ policy, index }))
    .filter(({ policy }) => policy.overflow === 'reserve-priority')
    .map(({ index }) => index);
  const recipients = priorityIndices.length > 0 ? priorityIndices : policies.map((_, index) => index);
  let recipient = 0;
  while (allocated < capacity) {
    const index = recipients[recipient % recipients.length]!;
    counts[index] = counts[index]! + 1;
    allocated += 1;
    recipient += 1;
  }

  let start = 0;
  return Object.freeze(policies.map((policy, archetypeIndex) => {
    const partition = Object.freeze({
      archetypeId: policy.archetypeId,
      archetypeIndex,
      start,
      count: counts[archetypeIndex]!,
      overflow: policy.overflow,
    });
    start += partition.count;
    return partition;
  }));
}
