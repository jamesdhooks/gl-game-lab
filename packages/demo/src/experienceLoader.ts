import { withEngineTimeScaleSetting, type ExperienceDefinition } from '@hooksjam/gl-game-lab-engine';

export async function loadDemoCatalog(): Promise<readonly ExperienceDefinition[]> {
  const [games, simulations] = await Promise.all([
    import('@hooksjam/gl-game-lab-games'),
    import('@hooksjam/gl-game-lab-simulations'),
  ]);
  return Object.freeze([...games.GAME_REGISTRY.values(), ...simulations.SIMULATION_REGISTRY.values()].map(withEngineTimeScaleSetting));
}

export async function loadDemoExperience(id: string | null): Promise<ExperienceDefinition> {
  const normalized = id?.trim().toLowerCase() ?? 'ball-pit';
  if (normalized === 'ball-pit' || normalized === 'reference-arena') {
    const games = await import('@hooksjam/gl-game-lab-games');
    return withEngineTimeScaleSetting(normalized === 'reference-arena' ? games.referenceArenaDefinition : games.ballPitDefinition);
  }
  const simulations = await import('@hooksjam/gl-game-lab-simulations');
  const simulation = simulations.SIMULATION_REGISTRY.tryGet(normalized);
  if (simulation) return withEngineTimeScaleSetting(simulation);
  const games = await import('@hooksjam/gl-game-lab-games');
  return withEngineTimeScaleSetting(games.ballPitDefinition);
}

export async function loadLifecycleAlternate(selectedId: string): Promise<ExperienceDefinition> {
  const games = await import('@hooksjam/gl-game-lab-games');
  return withEngineTimeScaleSetting(selectedId === 'reference-arena' ? games.ballPitDefinition : games.referenceArenaDefinition);
}
