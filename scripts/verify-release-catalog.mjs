import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RELEASE_EXPERIENCE_IDS } from './release-catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const games = await import(pathToFileURL(path.join(root, 'packages', 'games', 'dist', 'index.js')));
const simulations = await import(pathToFileURL(path.join(root, 'packages', 'simulations', 'dist', 'index.js')));
const definitions = [...games.GAME_REGISTRY.values(), ...simulations.SIMULATION_REGISTRY.values()];
const actualIds = definitions.map((definition) => definition.id);

if (JSON.stringify(actualIds) !== JSON.stringify(RELEASE_EXPERIENCE_IDS)) {
  throw new Error(`Release catalog mismatch. Expected ${RELEASE_EXPERIENCE_IDS.join(', ')}, received ${actualIds.join(', ')}`);
}

for (const definition of definitions) {
  const expectedKind = definition.id === 'ball-pit' ? 'game' : 'simulation';
  if (definition.kind !== expectedKind) throw new Error(`${definition.id} has unsupported release kind: ${definition.kind}; expected ${expectedKind}`);
  if (definition.capabilities.settings !== true) throw new Error(`${definition.id} does not expose its tuning menu`);
  if ((definition.settings?.length ?? 0) === 0) throw new Error(`${definition.id} has no release settings`);
  if (definition.capabilities.tutorial !== true || (definition.tutorialPages?.length ?? 0) === 0) {
    throw new Error(`${definition.id} does not expose its tutorial flow`);
  }
  const styles = definition.styleManifest?.styles ?? [];
  if (styles.length === 0) throw new Error(`${definition.id} has no release styles`);
  if (!styles.some((style) => style.id === definition.styleManifest.defaultStyleId)) {
    throw new Error(`${definition.id} default style is not in its style manifest`);
  }
  const plugins = definition.createPlugins({ profile: 'preview', seed: 5_366_110 });
  if (plugins.length === 0) throw new Error(`${definition.id} creates no engine plugins`);
  const pluginIds = plugins.map((plugin) => plugin.id);
  if (new Set(pluginIds).size !== pluginIds.length) throw new Error(`${definition.id} creates duplicate plugin ids`);
}

process.stdout.write(`Verified ${definitions.length} release experiences against the shipped registries.\n`);
