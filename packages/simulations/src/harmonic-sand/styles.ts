import type { ExperienceStyleManifest } from '@hooksjam/gl-game-lab-engine';

export const HARMONIC_SAND_STYLE_MANIFEST: ExperienceStyleManifest = Object.freeze({
  defaultStyleId: 'chladni-gold',
  renderLayers: ['particles', 'field', 'glow', 'debug'],
  passes: ['primitive', 'paletteMap', 'contourBands', 'fieldVisualize', 'trailFeedback', 'bloom'],
  qualities: ['basic', 'enhanced', 'raw'],
  styles: [
    style('chladni-gold', 'Chladni Gold', 'Black background with gold nodal structures.', [3810564, 9198354, 14067263, 16769698], 328707),
    style('laser-plate', 'Laser Plate', 'Bright cyan and magenta interference.', [58879, 3900150, 16732120, 16777215], 131594),
    style('ghost-frequency', 'Ghost Frequency', 'Trailing old wave patterns with a spectral edge.', [7268279, 9684477, 12891645, 16317180], 198154),
    style('neon-coral', 'Neon Coral', 'Warm coral and amber interference lines.', [4000770, 11546640, 16736046, 16766336], 656130),
    style('deep-void', 'Deep Void', 'Electric violet pulses through infinite darkness.', [1179696, 5570764, 11816447, 15782143], 262413),
    style('biolum-ocean', 'Biolum Ocean', 'Deep-sea bioluminescence in teal.', [6676, 26197, 50343, 8454120], 2568),
    style('ember-pulse', 'Ember Pulse', 'Smouldering ember lines in searing amber.', [1705472, 8002560, 15224832, 16758832], 524800),
    style('rainbow-interference', 'Rainbow Interference', 'Full-spectrum bands with candy-color nodes.', [16717636, 16766464, 58998, 2718207], 328459),
    style('prism-milk', 'Prism Milk', 'A pale opalescent plate with mineral pastels.', [16314591, 10475723, 16033733, 3954296], 16183783),
    style('magnetar-bloom', 'Magnetar Bloom', 'Deep green plasma with magenta harmonic edges.', [136205, 53380, 16722902, 16774051], 133126),
    style('__random__', 'Random', 'Picks a varied spectral palette.', [3359829, 6715306, 11189213, 16777215], 0),
  ],
});

export function rgb(color: number): readonly [number, number, number] {
  return [((color >>> 16) & 255) / 255, ((color >>> 8) & 255) / 255, (color & 255) / 255];
}

function style(id: string, name: string, description: string, palette: readonly number[], background: number) {
  return Object.freeze({ id, name, description, palette: Object.freeze(palette), background, passes: Object.freeze(['fieldVisualize']) });
}
