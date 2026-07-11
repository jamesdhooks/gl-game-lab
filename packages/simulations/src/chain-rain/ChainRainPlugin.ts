import { createExtensionToken, type EnginePlugin } from '@hooksjam/gl-game-lab-core';
import { EngineInput, EngineSchedule, ExperienceRuntimeControllerService, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';
import { ConstrainedCircleParticleWorld2D } from '@hooksjam/gl-game-lab-physics-2d';
import { GpuRenderPassQueueService, InstancedSegmentRenderer, ParticlePointRenderQueueService, WEBGL2_RENDERER_PLUGIN_ID, WebGL2RendererService } from '@hooksjam/gl-game-lab-render-webgl2';
import { CHAIN_RAIN_DEFAULTS, chainNumber, chainString, createChainRainConfig, type ChainRainConfig } from './config.js';
import { chainColor3, chainColor4, CHAIN_RAIN_STYLE_MANIFEST } from './styles.js';
export type ChainRainMode = 'draw' | 'build' | 'interact';
export interface ChainRainController extends ExperienceRuntimeController {
  readonly mode: ChainRainMode;
  readonly constraintCount: number;
}
export const ChainRainControllerService = createExtensionToken<ChainRainController>('gl-game-lab.simulations.chain-rain.controller');
export const CHAIN_RAIN_PLUGIN_ID = 'gl-game-lab.simulations.chain-rain';
type Point = {
  readonly x: number;
  readonly y: number;
};
export function createChainRainPlugin(initial: ChainRainConfig = CHAIN_RAIN_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  let config = initial, mode: ChainRainMode = launch.modeId === 'build' || launch.modeId === 'interact' ? launch.modeId : 'draw', styleId = validStyle(launch.styleId) ?? CHAIN_RAIN_STYLE_MANIFEST.defaultStyleId, pendingReset = true, width = 1, height = 1, elapsed = 0, nextDemo = 0, randomState = (launch.seed ?? 1369948382) >>> 0, cleanup = (): void => undefined;
  const world = new ConstrainedCircleParticleWorld2D(131072, 262144, {}, randomState), paths = new Map<number, Point[]>(), picked = new Int32Array(2048), pickedCount = new Map<number, number>(), renderRadii = new Float32Array(131072), renderSeeds = new Float32Array(131072);
  return {
    id: CHAIN_RAIN_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [
      {
        id: WEBGL2_RENDERER_PLUGIN_ID
      }
    ],
    install: context => {
      const renderer = context.get(WebGL2RendererService), input = context.get(EngineInput), particles = context.get(ParticlePointRenderQueueService), gpuPasses = context.get(GpuRenderPassQueueService), segments = new InstancedSegmentRenderer(renderer.device.gl);
      cleanup = () => segments.dispose();
      applyConfig();
      applyStyle();
      const controller: ChainRainController = {
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
        get entityCount() {
          return world.count;
        },
        get constraintCount() {
          return world.constraintCount;
        },
        setMode: value => {
          if (value !== 'draw' && value !== 'build' && value !== 'interact')
            throw new Error(`Unknown Chain Rain mode: ${value}`);
          mode = value;
          paths.clear();
          pickedCount.clear();
        },
        setStyle: value => {
          const next = validStyle(value);
          if (!next)
            throw new Error(`Unknown Chain Rain style: ${value}`);
          styleId = next;
          applyStyle();
        },
        setSetting: (key, value) => {
          config = createChainRainConfig({
            ...record(),
            [key]: value
          });
          applyConfig();
          applyStyle();
        },
        reset: () => {
          pendingReset = true;
        }
      };
      context.provide(ChainRainControllerService, controller);
      context.provide(ExperienceRuntimeControllerService, controller);
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.chain-rain.update',
        stage: 'update',
        run: ({ time }) => {
          const nextWidth = Math.max(1, renderer.sprites.activeCamera.viewportWidth), nextHeight = Math.max(1, renderer.sprites.activeCamera.viewportHeight), dt = Math.min(1 / 30, time.deltaSeconds);
          elapsed += dt;
          if (pendingReset || nextWidth !== width || nextHeight !== height) {
            width = nextWidth;
            height = nextHeight;
            reset();
            pendingReset = false;
          }
          for (const event of input.snapshot.events) {
            if (event.kind !== 'pointer')
              continue;
            const point = {
              x: event.x,
              y: event.y
            };
            if (event.phase === 'down') {
              if (mode === 'interact') {
                const count = world.pickNearby(point.x, point.y, chainNumber(config, 'interactionRadius'), picked);
                pickedCount.set(event.id, count);
                world.dragPicked(picked, count, point.x, point.y, dt);
              }
              else
                paths.set(event.id, [
                  point
                ]);
            }
            else if (event.phase === 'move') {
              if (mode === 'interact') {
                const count = pickedCount.get(event.id) ?? 0;
                world.dragPicked(picked, count, point.x, point.y, dt);
              }
              else {
                const path = paths.get(event.id);
                if (path && distance(path[path.length - 1] ?? point, point) > 4)
                  path.push(point);
              }
            }
            else {
              if (mode === 'interact')
                pickedCount.delete(event.id);
              else {
                const path = paths.get(event.id);
                if (path) {
                  if (distance(path[path.length - 1] ?? point, point) > 2)
                    path.push(point);
                  commitPath(path);
                  paths.delete(event.id);
                }
              }
            }
          }
          if ((launch.profile === 'preview' || launch.profile === 'demo') && elapsed >= nextDemo) {
            spawnRainChain();
            nextDemo = elapsed + 0.7 + random() * 0.65;
          }
          world.step(dt);
        }
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.chain-rain.render',
        stage: 'renderExtract',
        run: () => {
          const style = requireStyle(), palette3 = style.palette.slice(0, 4).map(chainColor3), palette4 = style.palette.slice(0, 4).map(color => chainColor4(color, 1)), renderStyle = chainString(config, 'renderStyle'), skin = chainNumber(config, 'skinWidth');
          gpuPasses.submit({
            id: 'chain-rain.links',
            execute: destination => {
              const packed = world.packSegments();
              segments.update(packed);
              if (renderStyle !== 'basic')
                segments.render(destination, {
                  worldWidth: width,
                  worldHeight: height,
                  palette: palette3,
                  radiusScale: renderStyle === 'ultra' ? skin * 2.15 : skin * 1.5,
                  opacity: renderStyle === 'ultra' ? 0.2 : 0.16,
                  blend: 'additive'
                });
              segments.render(destination, {
                worldWidth: width,
                worldHeight: height,
                palette: palette3,
                radiusScale: renderStyle === 'basic' ? 0.72 : skin,
                opacity: 0.96,
                blend: 'alpha'
              });
            }
          });
          const radiusScale = renderStyle === 'ultra' ? chainNumber(config, 'liquidParticleRadius') : renderStyle === 'enhanced' ? skin : 1;
          for (let i = 0; i < world.count; i += 1) {
            renderRadii[i] = (world.radii[i] ?? 1) * radiusScale;
            renderSeeds[i] = world.colorSeeds[i] ?? i;
          }
          if (renderStyle === 'ultra')
            particles.submit({
              id: 'chain-rain-density',
              count: world.count,
              positions: world.positions,
              radii: renderRadii,
              colorSeeds: renderSeeds,
              palette: palette4,
              blend: 'additive',
              opacity: Math.min(0.3, chainNumber(config, 'opacity') * 0.25)
            });
          particles.submit({
            id: 'chain-rain-nodes',
            count: world.count,
            positions: world.positions,
            radii: renderRadii,
            colorSeeds: renderSeeds,
            palette: palette4,
            blend: 'alpha',
            opacity: renderStyle === 'ultra' ? Math.min(1, chainNumber(config, 'opacity')) : 1
          });
        }
      });
      function reset() {
        world.clear(randomState);
        world.setBounds(width, height);
        paths.clear();
        pickedCount.clear();
        elapsed = 0;
        nextDemo = 0.6;
        for (let i = 0; i < 5; i += 1)
          spawnRainChain();
      }
      function applyConfig() {
        world.configure({
          maxParticles: Math.floor(chainNumber(config, 'maxNodes')),
          radius: chainNumber(config, 'nodeRadius'),
          radiusVariation: Math.min(1, chainNumber(config, 'nodeVariance') * 0.55),
          gravity: chainNumber(config, 'gravity'),
          solverIterations: Math.floor(chainNumber(config, 'solverPasses')),
          substeps: Math.floor(chainNumber(config, 'substeps')),
          constraintPasses: Math.floor(chainNumber(config, 'constraintPasses')),
          collisionSoftness: chainNumber(config, 'collisionSoftness'),
          contactFriction: chainNumber(config, 'friction'),
          openTop: true,
          wallBounce: false
        });
      }
      function applyStyle() {
        const style = requireStyle(), background = chainColor3(style.background), renderStyle = chainString(config, 'renderStyle');
        renderer.setClearColor([
          background[0],
          background[1],
          background[2],
          1
        ]);
        renderer.setPaletteBackdrop({
          base: [
            background[0],
            background[1],
            background[2],
            1
          ],
          palette: style.palette.slice(0, 4).map(color => chainColor4(color)),
          tier: 0.3,
          blendStrength: 0.07
        });
        renderer.setBloom({
          enabled: renderStyle === 'ultra',
          intensity: renderStyle === 'ultra' ? chainNumber(config, 'liquidBloomStrength') : 0.2,
          radius: 7,
          threshold: 0.58
        });
      }
      function spawnRainChain() {
        const radius = chainNumber(config, 'nodeRadius'), length = Math.max(4, Math.min(96, Math.round(chainNumber(config, 'chainLength') * (0.6 + random() * 1.3)))), angle = Math.PI * (0.15 + random() * 0.7), spacing = radius * 1.85, x = radius * 5 + random() * Math.max(radius * 4, width - radius * 10), points: Point[] = [];
        for (let i = 0; i < length; i += 1)
          points.push({
            x: x + Math.cos(angle) * i * spacing,
            y: -radius * 3 + Math.sin(angle) * i * spacing
          });
        addChain(points, true);
      }
      function commitPath(path: readonly Point[]) {
        if (mode === 'build')
          addFixture(path);
        else
          addChain(samplePath(path, chainNumber(config, 'nodeRadius') * 1.85), false);
      }
      function addChain(points: readonly Point[], falling: boolean) {
        if (points.length < 2)
          return;
        const stiffness = chainNumber(config, 'constraintStiffness'), base = chainNumber(config, 'nodeRadius'), phase = random() * Math.PI * 2, wavelength = chainNumber(config, 'nodeVarianceWavelength'), roughness = chainNumber(config, 'nodeVarianceRoughness'), variance = chainNumber(config, 'nodeVariance');
        let previous = -1, previousRadius = base;
        for (let i = 0; i < points.length; i += 1) {
          const point = points[i];
          if (!point)
            continue;
          const wave = Math.sin(i / wavelength * Math.PI * 2 + phase) * 0.7 + Math.sin(i / wavelength * Math.PI * 4.19 + phase * 0.31) * roughness * 0.3, nodeRadius = base * Math.max(0.35, 1 + wave * variance), node = world.addCircle(point.x, point.y, {
            radius: nodeRadius,
            velocityX: falling ? (random() - 0.5) * 100 : 0,
            velocityY: falling ? 80 + random() * 120 : 0,
            colorSeed: Math.floor(random() * 65536)
          });
          if (node < 0)
            break;
          if (previous >= 0)
            world.addDistanceConstraint(previous, node, {
              restLength: Math.max(base * 0.25, (previousRadius + nodeRadius) * 0.94),
              stiffness
            });
          previous = node;
          previousRadius = nodeRadius;
        }
      }
      function addFixture(path: readonly Point[]) {
        const radius = chainNumber(config, 'nodeRadius') * 2.25, samples = path.length === 1 ? [
          path[0] as Point
        ] : samplePath(path, radius * 1.35);
        for (const point of samples)
          world.addCircle(point.x, point.y, {
            radius,
            inverseMass: 0,
            colorSeed: 1
          });
      }
      function random() {
        randomState ^= randomState << 13;
        randomState ^= randomState >>> 17;
        randomState ^= randomState << 5;
        return (randomState >>> 0) / 4294967296;
      }
      function requireStyle() {
        const style = CHAIN_RAIN_STYLE_MANIFEST.styles.find(candidate => candidate.id === styleId);
        if (!style)
          throw new Error(`Unknown Chain Rain style: ${styleId}`);
        return style;
      }
      function record(): Readonly<Record<string, ExperienceSettingValue>> {
        return Object.freeze({
          ...config
        });
      }
    },
    dispose: () => cleanup()
  };
}
function samplePath(points: readonly Point[], spacing: number): Point[] {
  if (points.length < 2)
    return [
      ...points
    ];
  const result: Point[] = [
    points[0] as Point
  ];
  let remaining = spacing;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1], b = points[i];
    if (!a || !b)
      continue;
    let dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy), travel = 0;
    while (length - travel >= remaining) {
      travel += remaining;
      result.push({
        x: a.x + dx * (travel / length),
        y: a.y + dy * (travel / length)
      });
      remaining = spacing;
    }
    remaining -= Math.max(0, length - travel);
  }
  const last = points[points.length - 1];
  if (last && distance(result[result.length - 1] ?? last, last) > spacing * 0.35)
    result.push(last);
  return result;
}
function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function validStyle(value: string | undefined) {
  return value && CHAIN_RAIN_STYLE_MANIFEST.styles.some(style => style.id === value) ? value : undefined;
}
