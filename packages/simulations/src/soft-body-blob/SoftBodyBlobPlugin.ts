import { createExtensionToken, type EnginePlugin } from '@hooksjam/gl-game-lab-core';
import { EngineInput, EngineRender2D, EngineSchedule, InteractionRadiusIndicator2D, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';
import { registerSimulationRuntime } from '../SimulationPluginLifecycle.js';
import { packDrawPathPreview } from '../DrawPathPreview.js';
import { packBuildPreview } from '../BuildFixtures.js';
import { blobNumber, blobString, createSoftBodyBlobConfig, SOFT_BODY_BLOB_DEFAULTS, type SoftBodyBlobConfig } from './config.js';
import { prepareSoftBodyDrawBlueprint, softBodyNodeRadiusForDensity, SoftBodyModel, type SoftBodyDragForce } from './SoftBodyModel.js';
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
  const model = new SoftBodyModel(launch.profile === 'preview'), paths = new Map<number, Point[]>();
  const grabbedBodies = new Map<number, readonly number[]>(), dragPoints = new Map<number, Point>(), previousDragPoints = new Map<number, Point>();
  const interactionIndicator = new InteractionRadiusIndicator2D('soft-body-blob.interaction-radius');
  return {
    id: SOFT_BODY_BLOB_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: context => {
      const renderer = context.get(EngineRender2D), input = context.get(EngineInput);
      cleanup = () => undefined;
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
          grabbedBodies.clear();
          dragPoints.clear();
          previousDragPoints.clear();
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
      registerSimulationRuntime(context, SoftBodyBlobControllerService, controller, () => cleanup());
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.soft-body-blob.update',
        stage: 'update',
        run: ({ time }) => {
          const nextWidth = Math.max(1, renderer.viewport.width), nextHeight = Math.max(1, renderer.viewport.height), dt = Math.min(1 / 30, time.deltaSeconds);
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
                grabbedBodies.set(event.id, model.pickBodies(point.x, point.y, blobNumber(config, 'interactionRadius')));
                dragPoints.set(event.id, point);
                previousDragPoints.set(event.id, point);
              }
              else
                paths.set(event.id, [
                  point
                ]);
            }
            else if (event.phase === 'move') {
              if (mode === 'interact') {
                dragPoints.set(event.id, point);
              } else {
                const path = paths.get(event.id);
                if (path && distance(path[path.length - 1] ?? point, point) > 5) {
                  path.push(point);
                }
              }
            }
            else {
              if (mode === 'interact') {
                grabbedBodies.delete(event.id);
                dragPoints.delete(event.id);
                previousDragPoints.delete(event.id);
              } else {
                const path = paths.get(event.id);
                if (path) {
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
          const dragForces: SoftBodyDragForce[] = [];
          for (const [id, point] of dragPoints) {
            const previous = previousDragPoints.get(id) ?? point;
            dragForces.push({
              bodyIndices: grabbedBodies.get(id) ?? [],
              x: point.x,
              y: point.y,
              moveX: point.x - previous.x,
              moveY: point.y - previous.y,
              radius: blobNumber(config, 'interactionRadius'),
            });
          }
          model.step(dt, {
            blobSize: blobNumber(config, 'blobSize'),
            squishiness: effectiveSquish(),
            surfaceTension: blobNumber(config, 'surfaceTension'),
            areaPressure: blobNumber(config, 'areaPressure'),
            plasticFlow: blobNumber(config, 'plasticFlow'),
            boundaryElasticity: blobNumber(config, 'boundaryElasticity'),
            shapeRigidity: blobNumber(config, 'shapeRigidity'),
            membraneDamping: blobNumber(config, 'membraneDamping'),
            constraintPasses: blobNumber(config, 'constraintPasses')
          }, dragForces);
          for (const [id, point] of dragPoints) previousDragPoints.set(id, point);
        }
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.soft-body-blob.render',
        stage: 'renderExtract',
        run: () => {
          const style = requireStyle(), palette3 = style.palette.slice(0, 4).map(blobColor3), palette4 = style.palette.slice(0, 4).map(color => blobColor4(color)), renderStyle = blobString(config, 'renderStyle');
          if (renderStyle === 'enhanced') {
            const packed = model.packMesh(blobNumber(config, 'skinSmoothing'));
            renderer.submitTriangleMesh({
              id: 'soft-body-blob.mesh', ...packed, worldWidth: width, worldHeight: height,
              palette: palette3, opacity: 1, blend: 'opaque', shading: 'soft-body-skin'
            });
          }
          if (renderStyle === 'ultra') {
            const visual = model.packVisualPoints(blobNumber(config, 'liquidFillDensity'), palette3.length, blobNumber(config, 'fillerScale')), scale = 0.78 + blobNumber(config, 'liquidParticleRadius') * 0.46, radii = new Float32Array(visual.count);
            for (let i = 0; i < visual.count; i++) radii[i] = (visual.radii[i] ?? 1) * scale;
            renderer.submitMetaballs({
              id: 'soft-body-blob-liquid-surface', count: visual.count, positions: visual.positions,
              radii, temperatures: visual.seeds, worldWidth: width, worldHeight: height,
              fieldScale: blobNumber(config, 'liquidFieldScale'), particleRadiusScale: blobNumber(config, 'liquidSplatDensity'),
              threshold: blobNumber(config, 'liquidSurfaceThreshold'), edgeSoftness: blobNumber(config, 'liquidEdgeSoftness'),
              edgeTightness: blobNumber(config, 'liquidEdgeTightness'), palette: palette3, background: blobColor3(style.background),
              thermalContrast: 1, thermalStrength: blobNumber(config, 'liquidThermalStrength'), paletteMapping: 'gradient',
              refraction: blobNumber(config, 'liquidRefraction'), gloss: blobNumber(config, 'liquidGloss'),
              rimLighting: blobNumber(config, 'liquidRimLighting'), foamStrength: blobNumber(config, 'liquidFoamStrength'),
              bloomStrength: blobNumber(config, 'liquidBloomStrength'), heatShimmer: blobNumber(config, 'liquidHeatShimmer'),
              depthDiffusion: blobNumber(config, 'liquidDepthDiffusion'), opacity: blobNumber(config, 'opacity'),
              time: elapsed, renderStyle: 'ultra'
            });
          }
          if (renderStyle === 'basic') {
            const layers = model.packBasicVisualLayers(blobNumber(config, 'liquidFillDensity'), blobNumber(config, 'fillerScale'));
            if (layers.nodes.count > 0) renderer.submitParticles({ id: 'soft-body-blob-nodes', count: layers.nodes.count, positions: layers.nodes.positions, radii: layers.nodes.radii, colorSeeds: layers.nodes.seeds, palette: palette4, paletteMode: 'indexed', blend: 'alpha', opacity: 0.76 });
            if (layers.fillers.count > 0) renderer.submitParticles({ id: 'soft-body-blob-fillers', count: layers.fillers.count, positions: layers.fillers.positions, radii: layers.fillers.radii, colorSeeds: layers.fillers.seeds, palette: [[1, 1, 1, 1]], paletteMode: 'indexed', blend: 'alpha', opacity: 0.18 });
          }
          const fixtures = model.packBuildFixtures();
          if (fixtures.count > 0) renderer.submitSegments({
            id: 'soft-body-blob.build-fixtures', ...fixtures, worldWidth: width, worldHeight: height,
            palette: [[0.58, 0.58, 0.58]], opacity: 1, blend: 'alpha'
          });
          const preview = mode === 'build'
            ? packBuildPreview(paths.values(), softBodyNodeRadiusForDensity(blobNumber(config, 'nodeDensity')))
            : packDrawPathPreview(paths.values(), 'closed');
          if (preview.count > 0) renderer.submitSegments({
            id: 'soft-body-blob.draw-preview', ...preview, worldWidth: width, worldHeight: height,
            palette: [mode === 'build' ? [0.58, 0.58, 0.58] : [1, 0.42, 0.78]], opacity: 0.86, blend: 'alpha'
          });
          if (mode === 'interact') {
            interactionIndicator.submit(renderer, input.snapshot.pointers, blobNumber(config, 'interactionRadius'));
          }
        }
      });
      function reset() {
        model.reset(width, height, randomState);
        paths.clear();
        grabbedBodies.clear();
        dragPoints.clear();
        previousDragPoints.clear();
        elapsed = 0;
        nextDemo = 0.5;
      }
      function applyConfig() {
        model.configure({
          maxParticles: 65536,
          gravity: blobNumber(config, 'gravity'),
          substeps: Math.floor(blobNumber(config, 'substeps')),
          contactFriction: blobNumber(config, 'viscosity'),
          maxFrameDelta: 1 / 30
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
        renderer.setBackdrop({
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
          const radius = softBodyNodeRadiusForDensity(blobNumber(config, 'nodeDensity')), samples = sampleOpen(path, radius * 1.55);
          model.addFixture(samples.length ? samples : [
            path[0] as Point
          ], radius);
          return;
        }
        if (path.length < 5) return;
        const density = blobNumber(config, 'nodeDensity');
        const blueprint = prepareSoftBodyDrawBlueprint(path, blobNumber(config, 'drawSmoothing'), density, width, height);
        if (blueprint) model.addBlob(blueprint.centerX, blueprint.centerY, blueprint.radius, density, blueprint.outline, blueprint.restArea);
      }
      function spawnDemoBlob() {
        const size = blobNumber(config, 'blobSize') * (0.75 + random() * 0.45), x = size + random() * Math.max(1, width - size * 2), y = -size * 0.4 - random() * size;
        model.addBlob(x, y, Math.max(12, size), blobNumber(config, 'nodeDensity'));
      }
      function effectiveSquish() {
        return Math.min(2, blobNumber(config, 'squishiness'));
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
    }
  };
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
