import { createExtensionToken, type EnginePlugin } from '@hooksjam/gl-game-lab-core';
import { applyPaletteGradientBackdrop2D, EngineInput, EngineRender2D, EngineSchedule, InteractionRadiusIndicator2D, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';
import { registerSimulationRuntime } from '../SimulationPluginLifecycle.js';
import { packDrawPathPreview } from '../DrawPathPreview.js';
import { createBuildFixture, packBuildFixtures, packBuildPreview, sampleBuildFixture, type BuildFixture2D } from '../BuildFixtures.js';
import { ConstrainedCircleParticleWorld2D } from '@hooksjam/gl-game-lab-physics-2d';
import { CHAIN_RAIN_DEFAULTS, chainNumber, chainString, createChainRainConfig, type ChainRainConfig } from './config.js';
import { chainColor3, chainColor4, CHAIN_RAIN_STYLE_MANIFEST } from './styles.js';
export type ChainRainMode = 'draw' | 'build' | 'interact';
export interface ChainRainController extends ExperienceRuntimeController {
  readonly mode: ChainRainMode;
  readonly constraintCount: number;
}
export const ChainRainControllerService = createExtensionToken<ChainRainController>('gl-game-lab.simulations.chain-rain.controller');
export const CHAIN_RAIN_PLUGIN_ID = 'gl-game-lab.simulations.chain-rain';
export type ChainRainPoint = {
  readonly x: number;
  readonly y: number;
};
type Point = ChainRainPoint;
interface ChainBody { readonly indices: number[]; readonly fixture: boolean; readonly seed: number }
export interface ChainRainAutomationPolicy {
  readonly initialSnakeCount: number;
  readonly maximumSnakeCount: number;
  readonly firstSpawnDelay: number;
  readonly spawnInterval: number;
  readonly spawnIntervalJitter: number;
  readonly minimumLengthScale: number;
  readonly maximumLengthScale: number;
}
export function createChainRainPlugin(initial: ChainRainConfig = CHAIN_RAIN_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  const automation = chainRainAutomationPolicy(launch.profile);
  const worldCapacity = chainRainWorldCapacity(initial, launch.profile);
  let config = initial, mode: ChainRainMode = launch.modeId === 'build' || launch.modeId === 'interact' ? launch.modeId : 'draw', styleId = validStyle(launch.styleId) ?? CHAIN_RAIN_STYLE_MANIFEST.defaultStyleId, pendingReset = true, width = 1, height = 1, elapsed = 0, nextDemo = Number.POSITIVE_INFINITY, dynamicSnakeCount = 0, paletteOffset = 0, randomState = (launch.seed ?? 1369948382) >>> 0, cleanup = (): void => undefined;
  const world = new ConstrainedCircleParticleWorld2D(worldCapacity, worldCapacity * 2, {}, randomState), paths = new Map<number, Point[]>(), picked = new Int32Array(2048), pickedCount = new Map<number, number>(), bodies: ChainBody[] = [], buildFixtures: BuildFixture2D[] = [];
  const linkedPrevious = new Int32Array(worldCapacity), linkedNext = new Int32Array(worldCapacity), segmentPacker = new ChainSegmentPacker();
  const interactionIndicator = new InteractionRadiusIndicator2D('chain-rain.interaction-radius');
  let linkedNodeHighWater = 0, packedFixtures = packBuildFixtures(buildFixtures), fixturesDirty = false;
  world.setCollisionFilter((left, right) => {
    if ((linkedNext[left] ?? 0) === right + 1 || (linkedPrevious[left] ?? 0) === right + 1) return false;
    return (world.inverseMasses[left] ?? 0) > 0 || (world.inverseMasses[right] ?? 0) > 0;
  });
  return {
    id: CHAIN_RAIN_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: context => {
      const renderer = context.get(EngineRender2D), input = context.get(EngineInput);
      cleanup = () => undefined;
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
        get captureReady() {
          return !automation || hasVisibleDynamicChain(bodies, world, width, height);
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
      registerSimulationRuntime(context, ChainRainControllerService, controller, () => cleanup());
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.chain-rain.update',
        stage: 'update',
        run: ({ time }) => {
          const nextWidth = Math.max(1, renderer.viewport.width), nextHeight = Math.max(1, renderer.viewport.height), dt = Math.min(1 / 30, time.deltaSeconds);
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
          if (automation && elapsed >= nextDemo) {
            if (dynamicSnakeCount < automation.maximumSnakeCount) spawnRainChain();
            nextDemo = elapsed + automation.spawnInterval + random() * automation.spawnIntervalJitter;
          }
          world.step(dt);
        }
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.chain-rain.render',
        stage: 'renderExtract',
        run: () => {
          const style = requireStyle(), palette3 = style.palette.slice(0, 4).map(chainColor3), palette4 = style.palette.slice(0, 4).map(color => chainColor4(color, 1)), renderStyle = chainString(config, 'renderStyle'), skin = chainNumber(config, 'skinWidth');
          if (renderStyle === 'enhanced') {
            const bodySegments = segmentPacker.pack(bodies, world);
            if (bodySegments.count > 0) renderer.submitSegments({ id: 'chain-rain.skin', ...bodySegments, worldWidth: width, worldHeight: height, palette: palette3, paletteMode: 'indexed', radiusScale: skin, opacity: 1, blend: 'alpha' });
            const highlightWidth = chainNumber(config, 'skinHighlightWidth'), highlightOpacity = chainNumber(config, 'skinHighlightOpacity');
            if (bodySegments.count > 0 && highlightWidth > 0 && highlightOpacity > 0) renderer.submitSegments({ id: 'chain-rain.skin-highlight', ...bodySegments, worldWidth: width, worldHeight: height, palette: palette3.map(color => brightenColor(color, chainNumber(config, 'skinHighlightStrength'))), paletteMode: 'indexed', radiusScale: highlightWidth, opacity: highlightOpacity, blend: 'alpha' });
          } else if (renderStyle === 'ultra') {
            const liquid = packLiquidChains(bodies, world, chainNumber(config, 'liquidParticleRadius'), chainNumber(config, 'liquidFillDensity'));
            renderer.submitMetaballs({
              id: 'chain-rain-liquid-surface', count: liquid.count, positions: liquid.positions,
              radii: liquid.radii, temperatures: liquid.temperatures, worldWidth: width, worldHeight: height,
              fieldScale: chainNumber(config, 'liquidFieldScale'),
              particleRadiusScale: chainNumber(config, 'liquidSplatDensity'),
              threshold: chainNumber(config, 'liquidSurfaceThreshold'),
              edgeSoftness: chainNumber(config, 'liquidEdgeSoftness'), edgeTightness: chainNumber(config, 'liquidEdgeTightness'),
              palette: palette3, background: chainColor3(style.background), thermalContrast: 1,
              thermalStrength: chainNumber(config, 'liquidThermalStrength'), refraction: chainNumber(config, 'liquidRefraction'),
              gloss: chainNumber(config, 'liquidGloss'), rimLighting: chainNumber(config, 'liquidRimLighting'),
              foamStrength: chainNumber(config, 'liquidFoamStrength'), bloomStrength: chainNumber(config, 'liquidBloomStrength'),
              heatShimmer: chainNumber(config, 'liquidHeatShimmer'), depthDiffusion: chainNumber(config, 'liquidDepthDiffusion'),
              opacity: chainNumber(config, 'opacity'), time: elapsed, renderStyle: 'ultra'
            });
          } else {
            const nodes = packChainParticles(bodies, world, 1);
            renderer.submitParticles({ id: 'chain-rain-nodes', ...nodes, palette: palette4, paletteMode: 'indexed', blend: 'alpha', opacity: 1 });
          }
          if (fixturesDirty) {
            packedFixtures = packBuildFixtures(buildFixtures);
            fixturesDirty = false;
          }
          if (packedFixtures.count > 0) renderer.submitSegments({
            id: 'chain-rain.build-fixtures', ...packedFixtures, worldWidth: width, worldHeight: height,
            palette: [[0.58, 0.58, 0.58]], opacity: 1, blend: 'alpha'
          });
          if (paths.size > 0) {
            const preview = mode === 'build'
              ? packBuildPreview(paths.values(), chainNumber(config, 'nodeRadius') * 2.25)
              : packDrawPathPreview(paths.values(), 'open');
            if (preview.count > 0) renderer.submitSegments({
              id: 'chain-rain.draw-preview', ...preview, worldWidth: width, worldHeight: height,
              palette: [mode === 'build' ? [0.58, 0.58, 0.58] : [0.45, 0.92, 1]], opacity: 0.86, blend: 'alpha'
            });
          }
          if (mode === 'interact') {
            interactionIndicator.submit(renderer, input.snapshot.pointers, chainNumber(config, 'interactionRadius'));
          }
        }
      });
      function reset() {
        world.clear(randomState);
        bodies.length = 0;
        buildFixtures.length = 0;
        linkedPrevious.fill(0, 0, linkedNodeHighWater);
        linkedNext.fill(0, 0, linkedNodeHighWater);
        linkedNodeHighWater = 0;
        fixturesDirty = true;
        dynamicSnakeCount = 0;
        paletteOffset = Math.floor(random() * 4);
        world.setBounds(width, height);
        paths.clear();
        pickedCount.clear();
        elapsed = 0;
        nextDemo = automation?.firstSpawnDelay ?? Number.POSITIVE_INFINITY;
        if (automation) {
          for (const fixture of createChainRainAutomationFixtures(width, height, chainNumber(config, 'nodeRadius'), random, launch.profile === 'demo' ? 'demo' : 'preview'))
            addPreparedFixture(fixture);
        }
        for (let i = 0; i < (automation?.initialSnakeCount ?? 0); i += 1)
          spawnRainChain(i * 3 + random() * 2);
      }
      function applyConfig() {
        world.configure({
          maxParticles: Math.min(worldCapacity, Math.floor(chainNumber(config, 'maxNodes'))),
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
        const style = requireStyle(), renderStyle = chainString(config, 'renderStyle');
        applyPaletteGradientBackdrop2D(renderer, style);
        renderer.setBloom({
          enabled: renderStyle === 'ultra',
          intensity: renderStyle === 'ultra' ? chainNumber(config, 'liquidBloomStrength') : 0.2,
          radius: 7,
          threshold: 0.58
        });
      }
      function spawnRainChain(verticalGap = 0) {
        if (!automation) return;
        const radius = chainNumber(config, 'nodeRadius'), length = chainRainAutomatedLength(config, automation, random()), angle = Math.PI * (0.15 + random() * 0.7), spacing = radius * 1.85, x = radius * 5 + random() * Math.max(radius * 4, width - radius * 10), points: Point[] = [];
        for (let i = 0; i < length; i += 1)
          points.push({
            x: x + Math.cos(angle) * i * spacing,
            y: -radius * 3 + Math.sin(angle) * i * spacing
          });
        const clearance = chainRainAutomatedSpawnClearance(config);
        const horizontallyFitted = fitChainWithinHorizontalBounds(points, width, Math.min(clearance, width * 0.2));
        addChain(offsetChainAboveViewport(horizontallyFitted, clearance, verticalGap), true);
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
        const indices: number[] = [], seed = chainRainPaletteIndex(paletteOffset, dynamicSnakeCount);
        for (let i = 0; i < points.length; i += 1) {
          const point = points[i];
          if (!point)
            continue;
          const wave = Math.sin(i / wavelength * Math.PI * 2 + phase) * 0.7 + Math.sin(i / wavelength * Math.PI * 4.19 + phase * 0.31) * roughness * 0.3, nodeRadius = base * Math.max(0.35, 1 + wave * variance), node = world.addCircle(point.x, point.y, {
            radius: nodeRadius,
            velocityX: falling ? (random() - 0.5) * 100 : 0,
            velocityY: falling ? 80 + random() * 120 : 0,
            colorSeed: seed
          });
          if (node < 0)
            break;
          indices.push(node);
          if (previous >= 0) {
            world.addDistanceConstraint(previous, node, {
              restLength: Math.max(base * 0.25, (previousRadius + nodeRadius) * 0.94),
              stiffness
            });
            linkedNext[previous] = node + 1;
            linkedPrevious[node] = previous + 1;
          }
          linkedNodeHighWater = Math.max(linkedNodeHighWater, node + 1);
          previous = node;
          previousRadius = nodeRadius;
        }
        if (indices.length > 0) {
          bodies.push({ indices, fixture: false, seed });
          dynamicSnakeCount += 1;
        }
      }
      function addFixture(path: readonly Point[]) {
        const radius = chainNumber(config, 'nodeRadius') * 2.25, fixture = createBuildFixture(path, radius);
        if (!fixture) return;
        addPreparedFixture(fixture);
      }
      function addPreparedFixture(fixture: BuildFixture2D) {
        const samples = sampleBuildFixture(fixture);
        const indices: number[] = [];
        for (const point of samples) {
          const index = world.addCircle(point.x, point.y, {
            radius: fixture.radius,
            inverseMass: 0,
            colorSeed: 1
          });
          if (index >= 0) indices.push(index);
        }
        if (indices.length > 0) {
          bodies.push({ indices, fixture: true, seed: 0 });
          buildFixtures.push(fixture);
          fixturesDirty = true;
        }
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
    }
  };
}

export function chainRainAutomationPolicy(
  profile: ExperienceLaunchOptions['profile'],
): ChainRainAutomationPolicy | undefined {
  if (profile === 'preview') return Object.freeze({
    initialSnakeCount: 3,
    maximumSnakeCount: 8,
    firstSpawnDelay: 1.1,
    spawnInterval: 1.6,
    spawnIntervalJitter: 0.8,
    minimumLengthScale: 0.18,
    maximumLengthScale: 0.38,
  });
  if (profile === 'demo') return Object.freeze({
    initialSnakeCount: 4,
    maximumSnakeCount: 10,
    firstSpawnDelay: 0.9,
    spawnInterval: 1.5,
    spawnIntervalJitter: 0.7,
    minimumLengthScale: 0.22,
    maximumLengthScale: 0.46,
  });
  return undefined;
}

export function chainRainAutomatedLength(
  config: ChainRainConfig,
  policy: ChainRainAutomationPolicy,
  randomValue: number,
): number {
  const authoredLength = chainNumber(config, 'chainLength');
  const t = Math.max(0, Math.min(1, randomValue));
  const scale = policy.minimumLengthScale + (policy.maximumLengthScale - policy.minimumLengthScale) * t;
  return Math.max(4, Math.min(96, Math.round(authoredLength * scale)));
}

export function chainRainPaletteIndex(offset: number, snakeNumber: number, paletteSize = 4): number {
  const count = Math.max(1, Math.floor(paletteSize));
  return ((Math.floor(offset) + Math.floor(snakeNumber)) % count + count) % count;
}

export function chainRainWorldCapacity(
  config: ChainRainConfig,
  profile: ExperienceLaunchOptions['profile'],
): number {
  const requested = Math.floor(chainNumber(config, 'maxNodes'));
  return profile === 'preview' ? Math.min(requested, 2_048) : requested;
}

export function hasVisibleDynamicChain(
  bodies: readonly { readonly indices: readonly number[]; readonly fixture: boolean }[],
  world: Pick<ConstrainedCircleParticleWorld2D, 'positions' | 'radii'>,
  width: number,
  height: number,
): boolean {
  for (const body of bodies) {
    if (body.fixture) continue;
    for (const index of body.indices) {
      const offset = index * 2;
      const x = world.positions[offset] ?? Number.NEGATIVE_INFINITY;
      const y = world.positions[offset + 1] ?? Number.NEGATIVE_INFINITY;
      const radius = Math.max(0, world.radii[index] ?? 0);
      if (x + radius >= 0 && x - radius <= width && y + radius >= 0 && y - radius <= height) return true;
    }
  }
  return false;
}

export function offsetChainAboveViewport(points: readonly ChainRainPoint[], radius: number, verticalGap = 0): readonly ChainRainPoint[] {
  if (points.length === 0) return Object.freeze([]);
  const maxY = points.reduce((maximum, point) => Math.max(maximum, point.y), Number.NEGATIVE_INFINITY);
  const offsetY = -radius * (2 + Math.max(0, verticalGap)) - maxY;
  return Object.freeze(points.map(point => Object.freeze({ x: point.x, y: point.y + offsetY })));
}

export function fitChainWithinHorizontalBounds(
  points: readonly ChainRainPoint[],
  width: number,
  requestedMargin: number,
): readonly ChainRainPoint[] {
  if (points.length === 0) return Object.freeze([]);
  const safeWidth = Math.max(1, width);
  const margin = Math.max(0, Math.min(requestedMargin, safeWidth * 0.45));
  const minimumX = points.reduce((minimum, point) => Math.min(minimum, point.x), Number.POSITIVE_INFINITY);
  const maximumX = points.reduce((maximum, point) => Math.max(maximum, point.x), Number.NEGATIVE_INFINITY);
  const originalCenter = (minimumX + maximumX) * 0.5;
  const originalSpan = Math.max(0, maximumX - minimumX);
  const availableSpan = Math.max(0, safeWidth - margin * 2);
  const scale = originalSpan > availableSpan && originalSpan > 0 ? availableSpan / originalSpan : 1;
  const scaledHalfSpan = originalSpan * scale * 0.5;
  const targetCenter = Math.max(margin + scaledHalfSpan, Math.min(safeWidth - margin - scaledHalfSpan, originalCenter));
  return Object.freeze(points.map(point => Object.freeze({
    x: targetCenter + (point.x - originalCenter) * scale,
    y: point.y,
  })));
}

export function chainRainAutomatedSpawnClearance(config: ChainRainConfig): number {
  const maximumNodeRadius = chainNumber(config, 'nodeRadius') * (1 + chainNumber(config, 'nodeVariance'));
  const renderStyle = chainString(config, 'renderStyle');
  if (renderStyle === 'enhanced') {
    return maximumNodeRadius * Math.max(
      1,
      chainNumber(config, 'skinWidth'),
      chainNumber(config, 'skinHighlightWidth'),
    );
  }
  if (renderStyle === 'ultra') {
    return maximumNodeRadius * Math.max(1, 0.78 + chainNumber(config, 'liquidParticleRadius') * 0.46);
  }
  return maximumNodeRadius;
}

export function createChainRainAutomationFixtures(
  width: number,
  height: number,
  nodeRadius: number,
  random: () => number,
  profile: 'preview' | 'demo' = 'preview',
): readonly BuildFixture2D[] {
  const radius = nodeRadius * (profile === 'preview' ? 1.15 : 1.5);
  const margin = Math.max(radius * 1.5, Math.min(width, height) * 0.06);
  const count = (profile === 'preview' ? 3 : 4) + Math.floor(random() * 2);
  const minimumLength = width * (profile === 'preview' ? 0.08 : 0.1);
  const lengthRange = width * (profile === 'preview' ? 0.09 : 0.12);
  const separation = Math.max(radius * 0.65, Math.min(width, height) * 0.018);
  const fixtures: BuildFixture2D[] = [];
  for (let index = 0; index < count; index += 1) {
    const circle = index === 0 || (index > 1 && random() < 0.3);
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const angle = (random() - 0.5) * Math.PI * 0.9;
      const length = circle ? 0 : Math.min(minimumLength + random() * lengthRange, Math.max(0, width - margin * 2));
      const halfX = Math.abs(Math.cos(angle) * length * 0.5);
      const halfY = Math.abs(Math.sin(angle) * length * 0.5);
      const minX = margin + halfX, maxX = width - margin - halfX;
      const minY = Math.max(margin + halfY, height * 0.32), maxY = Math.min(height - margin - halfY, height * 0.84);
      const centerX = maxX > minX ? minX + random() * (maxX - minX) : width * 0.5;
      const centerY = maxY > minY ? minY + random() * (maxY - minY) : height * 0.58;
      const dx = Math.cos(angle) * length * 0.5, dy = Math.sin(angle) * length * 0.5;
      const candidate = Object.freeze({
        ax: centerX - dx,
        ay: centerY - dy,
        bx: centerX + dx,
        by: centerY + dy,
        radius,
      });
      if (fixtures.some(fixture => chainRainFixturesOverlap(candidate, fixture, separation))) continue;
      fixtures.push(candidate);
      break;
    }
  }
  return Object.freeze(fixtures);
}

export function chainRainFixturesOverlap(left: BuildFixture2D, right: BuildFixture2D, padding = 0): boolean {
  const clearance = left.radius + right.radius + Math.max(0, padding);
  return segmentDistanceSquared(left.ax, left.ay, left.bx, left.by, right.ax, right.ay, right.bx, right.by) < clearance * clearance;
}

function segmentDistanceSquared(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(
    pointSegmentDistanceSquared(ax, ay, cx, cy, dx, dy),
    pointSegmentDistanceSquared(bx, by, cx, cy, dx, dy),
    pointSegmentDistanceSquared(cx, cy, ax, ay, bx, by),
    pointSegmentDistanceSquared(dx, dy, ax, ay, bx, by),
  );
}

function pointSegmentDistanceSquared(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, denominator = dx * dx + dy * dy;
  const t = denominator > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denominator)) : 0;
  const offsetX = px - (ax + dx * t), offsetY = py - (ay + dy * t);
  return offsetX * offsetX + offsetY * offsetY;
}

function segmentsIntersect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const abC = cross(ax, ay, bx, by, cx, cy), abD = cross(ax, ay, bx, by, dx, dy);
  const cdA = cross(cx, cy, dx, dy, ax, ay), cdB = cross(cx, cy, dx, dy, bx, by);
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return true;
  const epsilon = 1e-7;
  return (Math.abs(abC) <= epsilon && pointWithinSegmentBounds(cx, cy, ax, ay, bx, by))
    || (Math.abs(abD) <= epsilon && pointWithinSegmentBounds(dx, dy, ax, ay, bx, by))
    || (Math.abs(cdA) <= epsilon && pointWithinSegmentBounds(ax, ay, cx, cy, dx, dy))
    || (Math.abs(cdB) <= epsilon && pointWithinSegmentBounds(bx, by, cx, cy, dx, dy));
}

function cross(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}

function pointWithinSegmentBounds(px: number, py: number, ax: number, ay: number, bx: number, by: number): boolean {
  return px >= Math.min(ax, bx) - 1e-7 && px <= Math.max(ax, bx) + 1e-7
    && py >= Math.min(ay, by) - 1e-7 && py <= Math.max(ay, by) + 1e-7;
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

function packChainParticles(bodies: readonly ChainBody[], world: ConstrainedCircleParticleWorld2D, radiusScale: number) {
  const count = bodies.reduce((sum, body) => sum + (body.fixture ? 0 : body.indices.length), 0), positions = new Float32Array(count * 2), radii = new Float32Array(count), colorSeeds = new Float32Array(count);
  let cursor = 0;
  for (const body of bodies) {
    if (body.fixture) continue;
    for (const index of body.indices) {
      positions[cursor * 2] = world.positions[index * 2] ?? 0; positions[cursor * 2 + 1] = world.positions[index * 2 + 1] ?? 0;
      radii[cursor] = (world.radii[index] ?? 1) * radiusScale; colorSeeds[cursor] = body.seed; cursor++;
    }
  }
  return { count, positions, radii, colorSeeds };
}

export class ChainSegmentPacker {
  private static readonly SUBDIVISIONS = 3;
  private segments = new Float32Array(0);
  private styles = new Float32Array(0);
  private colorSeeds = new Float32Array(0);
  private endRadii = new Float32Array(0);

  pack(bodies: readonly ChainBody[], world: ConstrainedCircleParticleWorld2D): {
    readonly count: number;
    readonly segments: Float32Array;
    readonly styles: Float32Array;
    readonly colorSeeds: Float32Array;
    readonly endRadii: Float32Array;
  } {
    const required = bodies.reduce((sum, body) => sum + (body.fixture ? 0 : Math.max(0, body.indices.length - 1) * ChainSegmentPacker.SUBDIVISIONS), 0);
    this.ensureCapacity(required);
    let count = 0;
    for (const body of bodies) {
      if (body.fixture) continue;
      const seed = Math.max(0, body.seed);
      for (let cursor = 1; cursor < body.indices.length; cursor += 1) {
        const previous = body.indices[Math.max(0, cursor - 2)] as number;
        const left = body.indices[cursor - 1] as number;
        const right = body.indices[cursor] as number;
        const next = body.indices[Math.min(body.indices.length - 1, cursor + 1)] as number;
        const p0 = previous * 2, p1 = left * 2, p2 = right * 2, p3 = next * 2;
        const leftRadius = world.radii[left] ?? 1;
        const rightRadius = world.radii[right] ?? 1;
        for (let subdivision = 0; subdivision < ChainSegmentPacker.SUBDIVISIONS; subdivision += 1) {
          const start = subdivision / ChainSegmentPacker.SUBDIVISIONS;
          const end = (subdivision + 1) / ChainSegmentPacker.SUBDIVISIONS;
          const segmentOffset = count * 4, styleOffset = count * 2;
          this.segments[segmentOffset] = catmullRom(world.positions[p0] ?? 0, world.positions[p1] ?? 0, world.positions[p2] ?? 0, world.positions[p3] ?? 0, start);
          this.segments[segmentOffset + 1] = catmullRom(world.positions[p0 + 1] ?? 0, world.positions[p1 + 1] ?? 0, world.positions[p2 + 1] ?? 0, world.positions[p3 + 1] ?? 0, start);
          this.segments[segmentOffset + 2] = catmullRom(world.positions[p0] ?? 0, world.positions[p1] ?? 0, world.positions[p2] ?? 0, world.positions[p3] ?? 0, end);
          this.segments[segmentOffset + 3] = catmullRom(world.positions[p0 + 1] ?? 0, world.positions[p1 + 1] ?? 0, world.positions[p2 + 1] ?? 0, world.positions[p3 + 1] ?? 0, end);
          this.styles[styleOffset] = leftRadius + (rightRadius - leftRadius) * start;
          this.styles[styleOffset + 1] = 1;
          this.colorSeeds[count] = seed;
          this.endRadii[count] = leftRadius + (rightRadius - leftRadius) * end;
          count += 1;
        }
      }
    }
    return { count, segments: this.segments, styles: this.styles, colorSeeds: this.colorSeeds, endRadii: this.endRadii };
  }

  private ensureCapacity(required: number): void {
    if (this.colorSeeds.length >= required) return;
    const capacity = Math.max(16, 2 ** Math.ceil(Math.log2(required)));
    this.segments = new Float32Array(capacity * 4);
    this.styles = new Float32Array(capacity * 2);
    this.colorSeeds = new Float32Array(capacity);
    this.endRadii = new Float32Array(capacity);
  }
}

function catmullRom(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}

function brightenColor(color: readonly [number, number, number], amount: number): readonly [number, number, number] {
  return [color[0] + (1 - color[0]) * amount, color[1] + (1 - color[1]) * amount, color[2] + (1 - color[2]) * amount];
}

function packLiquidChains(bodies: readonly ChainBody[], world: ConstrainedCircleParticleWorld2D, liquidRadius: number, fillDensity: number) {
  const capacity = bodies.reduce((sum, body) => sum + (body.fixture ? 0 : Math.max(1, body.indices.length) * 14), 0), positions = new Float32Array(capacity * 2), radii = new Float32Array(capacity), temperatures = new Float32Array(capacity);
  const visualScale = 0.78 + liquidRadius * 0.46, spacingScale = Math.max(0.32, 1.25 - Math.max(0, Math.min(3, fillDensity)) * 0.24);
  let count = 0;
  const push = (x: number, y: number, radius: number, temperature: number) => { if (count >= capacity) return; positions[count * 2] = x; positions[count * 2 + 1] = y; radii[count] = radius; temperatures[count] = temperature; count++; };
  for (const body of bodies) {
    if (body.fixture) continue;
    const thermal = (body.seed % 4) / 3;
    for (let cursor = 0; cursor < body.indices.length; cursor++) {
      const index = body.indices[cursor] as number, x = world.positions[index * 2] ?? 0, y = world.positions[index * 2 + 1] ?? 0, radius = (world.radii[index] ?? 1) * visualScale;
      push(x, y, radius, thermal);
      if (cursor >= body.indices.length - 1) continue;
      const next = body.indices[cursor + 1] as number, nx = world.positions[next * 2] ?? x, ny = world.positions[next * 2 + 1] ?? y, nextRadius = (world.radii[next] ?? 1) * visualScale, averageRadius = (radius + nextRadius) * 0.5;
      const bridgeCount = Math.max(0, Math.min(12, Math.ceil(Math.hypot(nx - x, ny - y) / Math.max(1, averageRadius * spacingScale)) - 1));
      for (let bridge = 1; bridge <= bridgeCount; bridge++) { const t = bridge / (bridgeCount + 1); push(x + (nx - x) * t, y + (ny - y) * t, averageRadius, thermal); }
    }
  }
  return { count, positions, radii, temperatures };
}
function validStyle(value: string | undefined) {
  return value && CHAIN_RAIN_STYLE_MANIFEST.styles.some(style => style.id === value) ? value : undefined;
}
