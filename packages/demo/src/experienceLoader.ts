import type { ExperienceDefinition } from '@hooksjam/gl-game-lab-engine';

export async function loadDemoExperience(id: string | null): Promise<ExperienceDefinition> {
  const normalized = id?.trim().toLowerCase() ?? 'ball-pit';
  if (normalized === 'ball-pit' || normalized === 'reference-arena') {
    const games = await import('@hooksjam/gl-game-lab-games');
    return normalized === 'reference-arena' ? games.referenceArenaDefinition : games.ballPitDefinition;
  }
  const simulations = await import('@hooksjam/gl-game-lab-simulations');
  const simulation = simulations.SIMULATION_REGISTRY.tryGet(normalized);
  if (simulation) return simulation;
  const games = await import('@hooksjam/gl-game-lab-games');
  return games.ballPitDefinition;
}

export async function loadLifecycleAlternate(selectedId: string): Promise<ExperienceDefinition> {
  const games = await import('@hooksjam/gl-game-lab-games');
  return selectedId === 'reference-arena' ? games.ballPitDefinition : games.referenceArenaDefinition;
}
