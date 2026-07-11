import { createExtensionToken, type EnginePlugin } from '@hooksjam/gl-game-lab-core';
import { EngineInput, EngineRender2D, EngineSchedule, ExperienceRuntimeControllerService, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';
import { createVascularTreeConfig, VASCULAR_TREE_DEFAULTS, type VascularTreeConfig } from './config.js';
import { VASCULAR_MARKER_SHADER } from './shaders.js';
import { vascularColor3, VASCULAR_TREE_STYLE_MANIFEST } from './styles.js';
import { VascularGrowthModel } from './VascularGrowthModel.js';
export type VascularTreeMode = 'guide' | 'feed' | 'prune';
export interface VascularTreeController extends ExperienceRuntimeController {
  readonly mode: VascularTreeMode;
  readonly nodeCount: number;
}
export const VascularTreeControllerService = createExtensionToken<VascularTreeController>('gl-game-lab.simulations.alien-vascular-tree.controller');
export const VASCULAR_TREE_PLUGIN_ID = 'gl-game-lab.simulations.alien-vascular-tree';
export function createVascularTreePlugin(initial: VascularTreeConfig = VASCULAR_TREE_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  let config = initial, mode: VascularTreeMode = launch.modeId === 'feed' || launch.modeId === 'prune' ? launch.modeId : 'guide', styleId = validStyle(launch.styleId) ?? VASCULAR_TREE_STYLE_MANIFEST.defaultStyleId, elapsed = 0, pendingReset = true, lastWidth = 0, lastHeight = 0, marker = {
    x: 0,
    y: 0,
    visible: false
  }, cleanup = (): void => undefined;
  const model = new VascularGrowthModel(launch.seed ?? 260617);
  return {
    id: VASCULAR_TREE_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: context => {
      const renderer = context.get(EngineRender2D), input = context.get(EngineInput);
      cleanup = () => undefined;
      applyStyle();
      const controller: VascularTreeController = {
        get mode() {
          return mode;
        },
        get modeId() {
          return mode;
        },
        get styleId() {
          return styleId;
        },
        get settings() {
          return Object.freeze({
            ...config
          });
        },
        get nodeCount() {
          return model.nodes.length;
        },
        get entityCount() {
          return model.nodes.length;
        },
        setMode: value => {
          if (value !== 'guide' && value !== 'feed' && value !== 'prune')
            throw new Error(`Unknown Vascular Tree mode: ${value}`);
          mode = value;
        },
        setStyle: value => {
          const next = validStyle(value);
          if (!next)
            throw new Error(`Unknown Vascular Tree style: ${value}`);
          styleId = next;
          applyStyle();
        },
        setSetting: (key, value) => {
          config = createVascularTreeConfig({
            ...record(),
            [key]: value
          });
        },
        reset: () => {
          pendingReset = true;
          elapsed = 0;
        }
      };
      context.provide(VascularTreeControllerService, controller);
      context.provide(ExperienceRuntimeControllerService, controller);
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.alien-vascular-tree.update',
        stage: 'update',
        run: ({ time }) => {
          const width = Math.max(1, renderer.viewport.width), height = Math.max(1, renderer.viewport.height), dt = Math.min(0.05, time.deltaSeconds) * config.timeScale;
          if (pendingReset || lastWidth !== width || lastHeight !== height) {
            model.reset(width, height);
            lastWidth = width;
            lastHeight = height;
            pendingReset = false;
            marker = {
              x: width * 0.5,
              y: height * 0.2,
              visible: false
            };
          }
          elapsed += dt;
          for (const event of input.snapshot.events)
            if (event.kind === 'pointer' && (event.phase === 'down' || event.phase === 'move')) {
              marker = {
                x: event.x,
                y: event.y,
                visible: true
              };
              if (mode === 'guide')
                model.guideTo(event.x, event.y, event.phase === 'down');
              else if (mode === 'feed')
                model.feed(event.x, event.y, event.phase === 'down' ? 112 : 86, config.nutrientFlow * (event.phase === 'down' ? 0.9 : 0.28));
              else
                model.prune(event.x, event.y, 82, config.pruneRate * (event.phase === 'down' ? 3.2 : 1.1));
            }
          if ((launch.profile === 'preview' || launch.profile === 'demo') && input.snapshot.pointers.length === 0) {
            const x = width * (0.5 + Math.sin(elapsed * 0.43) * 0.36), y = height * (0.18 + Math.cos(elapsed * 0.31) * 0.12);
            marker = {
              x,
              y,
              visible: false
            };
            model.guideTo(x, y);
            if (Math.floor((elapsed - dt) * 0.7) !== Math.floor(elapsed * 0.7))
              model.feed(x, y, 110, config.nutrientFlow * 0.8);
          }
          model.update(dt, width, height, config);
        }
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.alien-vascular-tree.render',
        stage: 'renderExtract',
        run: () => {
          const packed = model.pack(elapsed, config.nutrientFlow), style = requireStyle(), palette = style.palette.slice(0, 4).map(vascularColor3);
          renderer.submitSegments({ id: 'alien-vascular-tree.branches-glow', ...packed, worldWidth: lastWidth, worldHeight: lastHeight, palette, radiusScale: 3.2 * (config.resolution / 128) ** 0.1, opacity: 0.3, blend: 'additive' });
          renderer.submitSegments({ id: 'alien-vascular-tree.branches', ...packed, worldWidth: lastWidth, worldHeight: lastHeight, palette, radiusScale: 1, opacity: 1, blend: 'alpha' });
          renderer.submitFullscreenEffect({
            id: 'alien-vascular-tree.guide',
            language: 'glsl-es-300',
            fragmentSource: VASCULAR_MARKER_SHADER,
            blend: 'alpha',
            uniforms: {
              uResolution: {
                type: '2f',
                value: [
                  lastWidth,
                  lastHeight
                ]
              },
              uPoint: {
                type: '2f',
                value: [
                  marker.x,
                  marker.y
                ]
              },
              uRadius: {
                type: '1f',
                value: mode === 'prune' ? 22 : mode === 'feed' ? 18 : 14
              },
              uColor: {
                type: '3f',
                value: vascularColor3(style.palette[mode === 'prune' ? 2 : mode === 'feed' ? 1 : 3] ?? 16777215)
              },
              uVisible: {
                type: '1f',
                value: marker.visible ? 1 : 0
              }
            }
          });
        }
      });
      function applyStyle() {
        const background = vascularColor3(requireStyle().background);
        renderer.setClearColor([
          background[0],
          background[1],
          background[2],
          1
        ]);
        renderer.setBackdrop({
          base: [
            background[0],
            background[1],
            background[2],
            1
          ],
          palette: requireStyle().palette.slice(0, 4).map(color => [
            ...vascularColor3(color),
            1
          ] as const),
          tier: 0.35,
          blendStrength: 0.08
        });
        renderer.setBloom({
          enabled: false
        });
      }
    },
    dispose: () => cleanup()
  };
  function requireStyle() {
    const style = VASCULAR_TREE_STYLE_MANIFEST.styles.find(candidate => candidate.id === styleId);
    if (!style)
      throw new Error(`Unknown Vascular Tree style: ${styleId}`);
    return style;
  }
  function record(): Readonly<Record<string, ExperienceSettingValue>> {
    return Object.freeze({
      ...config
    });
  }
}
function validStyle(value: string | undefined) {
  return value && VASCULAR_TREE_STYLE_MANIFEST.styles.some(style => style.id === value) ? value : undefined;
}
