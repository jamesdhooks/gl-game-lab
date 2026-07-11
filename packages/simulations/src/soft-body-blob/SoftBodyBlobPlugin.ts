import { createExtensionToken, type EnginePlugin } from '@hooksjam/gl-game-lab-core';
import { EngineInput, EngineSchedule, ExperienceRuntimeControllerService, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';
import { DynamicTriangleMeshRenderer, GpuRenderPassQueueService, InstancedSegmentRenderer, ParticlePointRenderQueueService, WEBGL2_RENDERER_PLUGIN_ID, WebGL2RendererService } from '@hooksjam/gl-game-lab-render-webgl2';
import { blobNumber, blobString, createSoftBodyBlobConfig, SOFT_BODY_BLOB_DEFAULTS, type SoftBodyBlobConfig } from './config.js';
import { SoftBodyModel } from './SoftBodyModel.js';
import { blobColor3, blobColor4, SOFT_BODY_BLOB_STYLE_MANIFEST } from './styles.js';
export type SoftBodyBlobMode = 'draw' | 'build' | 'interact';
export interface SoftBodyBlobController extends ExperienceRuntimeController {
  readonly mode: SoftBodyBlobMode;
  readonly bodyCount: number;
}
export const SoftBodyBlobControllerService = createExtensionToken<SoftBodyBlobController>('gl-game-lab.simulations.soft-body-blob.controller');
export const SOFT_BODY_BLOB_PLUGIN_ID = 'gl-game-lab.simulations.soft-body-blob';
type Point = {
  readonly x: number;
  readonly y: number;
};
export function createSoftBodyBlobPlugin(initial: SoftBodyBlobConfig = SOFT_BODY_BLOB_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  let config = initial, mode: SoftBodyBlobMode = launch.modeId === 'build' || launch.modeId === 'interact' ? launch.modeId : 'draw', styleId = validStyle(launch.styleId) ?? SOFT_BODY_BLOB_STYLE_MANIFEST.defaultStyleId, pendingReset = true, width = 1, height = 1, elapsed = 0, nextDemo = 0, randomState = (launch.seed ?? 1358409995) >>> 0, cleanup = (): void => undefined;
  const model = new SoftBodyModel(), paths = new Map<number, Point[]>(), picked = new Int32Array(2048), pickedCounts = new Map<number, number>();
  return {
    id: SOFT_BODY_BLOB_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [
      {
        id: WEBGL2_RENDERER_PLUGIN_ID
      }
    ],
    install: context => {
      const renderer = context.get(WebGL2RendererService), input = context.get(EngineInput), particles = context.get(ParticlePointRenderQueueService), passes = context.get(GpuRenderPassQueueService), mesh = new DynamicTriangleMeshRenderer(renderer.device.gl), outlines = new InstancedSegmentRenderer(renderer.device.gl);
      cleanup = () => {
        mesh.dispose();
        outlines.dispose();
      };
      applyConfig();
      applyStyle();
      const controller: SoftBodyBlobController = {
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
          return model.world.count;
        },
        get bodyCount() {
          return model.bodies.length;
        },
        setMode: value => {
          if (value !== 'draw' && value !== 'build' && value !== 'interact')
            throw new Error(`Unknown Soft Body Blob mode: ${value}`);
          mode = value;
          paths.clear();
          pickedCounts.clear();
        },
        setStyle: value => {
          const next = validStyle(value);
          if (!next)
            throw new Error(`Unknown Soft Body Blob style: ${value}`);
          styleId = next;
          applyStyle();
        },
        setSetting: (key, value) => {
          config = createSoftBodyBlobConfig({
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
      context.provide(SoftBodyBlobControllerService, controller);
      context.provide(ExperienceRuntimeControllerService, controller);
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.soft-body-blob.update',
        stage: 'update',
        run: ({ time }) => {
          const nextWidth = Math.max(1, renderer.sprites.activeCamera.viewportWidth), nextHeight = Math.max(1, renderer.sprites.activeCamera.viewportHeight), dt = Math.min(1 / 30, time.deltaSeconds);
          elapsed += dt;
          if (pendingReset || width !== nextWidth || height !== nextHeight) {
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
                const count = model.world.pickNearby(point.x, point.y, blobNumber(config, 'interactionRadius'), picked);
                pickedCounts.set(event.id, count);
                model.world.dragPicked(picked, count, point.x, point.y, dt);
              }
              else
                paths.set(event.id, [
                  point
                ]);
            }
            else if (event.phase === 'move') {
              if (mode === 'interact')
                model.world.dragPicked(picked, pickedCounts.get(event.id) ?? 0, point.x, point.y, dt);
              else {
                const path = paths.get(event.id);
                if (path && distance(path[path.length - 1] ?? point, point) > 4) {
                  path.push(point);
                  if (path.length > 256)
                    path.shift();
                }
              }
            }
            else {
              if (mode === 'interact')
                pickedCounts.delete(event.id);
              else {
                const path = paths.get(event.id);
                if (path) {
                  if (distance(path[path.length - 1] ?? point, point) > 2)
                    path.push(point);
                  commit(path);
                  paths.delete(event.id);
                }
              }
            }
          }
          if ((launch.profile === 'preview' || launch.profile === 'demo') && elapsed >= nextDemo) {
            spawnDemoBlob();
            nextDemo = elapsed + 0.48 + random() * 0.36;
          }
          model.step(dt, {
            squishiness: effectiveSquish(),
            surfaceTension: blobNumber(config, 'surfaceTension'),
            areaPressure: blobNumber(config, 'areaPressure'),
            plasticFlow: blobNumber(config, 'plasticFlow'),
            boundaryElasticity: blobNumber(config, 'boundaryElasticity')
          });
        }
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.soft-body-blob.render',
        stage: 'renderExtract',
        run: () => {
          const style = requireStyle(), palette3 = style.palette.slice(0, 4).map(blobColor3), palette4 = style.palette.slice(0, 4).map(color => blobColor4(color)), renderStyle = blobString(config, 'renderStyle');
          passes.submit({
            id: 'soft-body-blob.mesh',
            execute: destination => {
              if (renderStyle !== 'basic') {
                const packed = model.packMesh();
                mesh.update(packed);
                if (renderStyle === 'ultra')
                  mesh.render(destination, {
                    worldWidth: width,
                    worldHeight: height,
                    palette: palette3,
                    opacity: 0.18,
                    blend: 'additive'
                  });
                mesh.render(destination, {
                  worldWidth: width,
                  worldHeight: height,
                  palette: palette3,
                  opacity: renderStyle === 'ultra' ? blobNumber(config, 'opacity') * 0.78 : 0.72,
                  blend: 'alpha'
                });
              }
              const outline = model.packOutlines();
              outlines.update(outline);
              outlines.render(destination, {
                worldWidth: width,
                worldHeight: height,
                palette: palette3,
                radiusScale: renderStyle === 'basic' ? 0.72 : 1,
                opacity: 0.9,
                blend: 'alpha'
              });
            }
          });
          const visual = model.packVisualPoints(renderStyle === 'basic' ? blobNumber(config, 'liquidFillDensity') : 0), scale = renderStyle === 'ultra' ? blobNumber(config, 'liquidParticleRadius') : renderStyle === 'enhanced' ? 0.72 : 1, radii = new Float32Array(visual.count);
          for (let i = 0; i < visual.count; i++)
            radii[i] = (visual.radii[i] ?? 1) * scale;
          if (renderStyle === 'ultra')
            particles.submit({
              id: 'soft-body-blob-density',
              count: visual.count,
              positions: visual.positions,
              radii,
              colorSeeds: visual.seeds,
              palette: palette4,
              blend: 'additive',
              opacity: 0.22
            });
          particles.submit({
            id: 'soft-body-blob-points',
            count: visual.count,
            positions: visual.positions,
            radii,
            colorSeeds: visual.seeds,
            palette: palette4,
            blend: 'alpha',
            opacity: renderStyle === 'ultra' ? 0.58 : 1
          });
        }
      });
      function reset() {
        model.reset(width, height, randomState);
        paths.clear();
        pickedCounts.clear();
        elapsed = 0;
        nextDemo = 0.5;
        for (let i = 0; i < 4; i++)
          spawnDemoBlob();
      }
      function applyConfig() {
        const viscosity = blobNumber(config, 'viscosity'), squish = effectiveSquish(), surface = blobNumber(config, 'surfaceTension'), preview = launch.profile === 'preview';
        model.configure({
          maxParticles: 65536,
          radius: 5,
          radiusVariation: 0,
          gravity: blobNumber(config, 'gravity'),
          solverIterations: 2,
          substeps: Math.floor(blobNumber(config, 'substeps')),
          constraintPasses: Math.floor(blobNumber(config, 'constraintPasses')),
          constraintStiffnessScale: (0.48 + surface * 0.5) / (1 + squish * 0.74) * (preview ? 0.42 : 1),
          collisionSoftness: Math.min(1.5, 0.64 + squish * 0.22),
          contactFriction: viscosity,
          solverDamping: Math.max(0.82, 0.998 - blobNumber(config, 'membraneDamping') * 0.05),
          airDrag: Math.max(0.9, 0.999 - viscosity * 0.025),
          openTop: true,
          wallBounce: false
        });
      }
      function applyStyle() {
        const style = requireStyle(), background = blobColor3(style.background), ultra = blobString(config, 'renderStyle') === 'ultra';
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
          palette: style.palette.slice(0, 4).map(color => blobColor4(color)),
          tier: 0.33,
          blendStrength: 0.08
        });
        renderer.setBloom({
          enabled: ultra,
          intensity: ultra ? blobNumber(config, 'liquidBloomStrength') : 0.2,
          radius: 8,
          threshold: 0.54
        });
      }
      function commit(path: readonly Point[]) {
        if (mode === 'build') {
          const radius = Math.max(5, blobNumber(config, 'blobSize') * 0.18), samples = sampleOpen(path, radius * 1.35);
          model.addFixture(samples.length ? samples : [
            path[0] as Point
          ], radius);
          return;
        }
        if (path.length < 8) {
          const point = path[0];
          if (point)
            model.addBlob(point.x, point.y, blobNumber(config, 'blobSize'), blobNumber(config, 'nodeDensity'));
          return;
        }
        const outline = smoothClosed(path, blobNumber(config, 'drawSmoothing'));
        let cx = 0, cy = 0;
        for (const point of outline) {
          cx += point.x;
          cy += point.y;
        }
        cx /= outline.length;
        cy /= outline.length;
        let radius = 0;
        for (const point of outline)
          radius += distance(point, {
            x: cx,
            y: cy
          });
        radius /= outline.length;
        model.addBlob(cx, cy, Math.max(18, radius), blobNumber(config, 'nodeDensity'), outline);
      }
      function spawnDemoBlob() {
        const size = blobNumber(config, 'blobSize') * (launch.profile === 'preview' ? 0.48 : 0.75 + random() * 0.45), x = size + random() * Math.max(1, width - size * 2), y = -size * 0.4 - random() * size;
        model.addBlob(x, y, Math.max(12, size), blobNumber(config, 'nodeDensity'));
      }
      function effectiveSquish() {
        return Math.min(2, blobNumber(config, 'squishiness') + (launch.profile === 'preview' ? 0.9 : 0));
      }
      function random() {
        randomState ^= randomState << 13;
        randomState ^= randomState >>> 17;
        randomState ^= randomState << 5;
        return (randomState >>> 0) / 4294967296;
      }
      function requireStyle() {
        const style = SOFT_BODY_BLOB_STYLE_MANIFEST.styles.find(candidate => candidate.id === styleId);
        if (!style)
          throw new Error(`Unknown Soft Body Blob style: ${styleId}`);
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
function smoothClosed(points: readonly Point[], amount: number): Point[] {
  let result = points.filter((_, i) => i % Math.max(1, Math.ceil(points.length / 96)) === 0).map(point => ({
    ...point
  }));
  for (let pass = 0; pass < 3; pass++)
    result = result.map((point, i) => {
      const previous = result[(i - 1 + result.length) % result.length] ?? point, next = result[(i + 1) % result.length] ?? point;
      return {
        x: point.x * (1 - amount * 0.5) + (previous.x + next.x) * amount * 0.25,
        y: point.y * (1 - amount * 0.5) + (previous.y + next.y) * amount * 0.25
      };
    });
  return result;
}
function sampleOpen(points: readonly Point[], spacing: number) {
  if (points.length < 2)
    return [
      ...points
    ];
  const result: Point[] = [
    points[0] as Point
  ];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (!a || !b)
      continue;
    const length = distance(a, b), count = Math.floor(length / spacing);
    for (let n = 1; n <= count; n++)
      result.push({
        x: a.x + (b.x - a.x) * n / (count + 1),
        y: a.y + (b.y - a.y) * n / (count + 1)
      });
    result.push(b);
  }
  return result;
}
function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function validStyle(value: string | undefined) {
  return value && SOFT_BODY_BLOB_STYLE_MANIFEST.styles.some(style => style.id === value) ? value : undefined;
}
