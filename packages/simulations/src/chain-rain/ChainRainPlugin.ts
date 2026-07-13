import { createExtensionToken, type EnginePlugin } from '@hooksjam/gl-game-lab-core';
import { EngineInput, EngineRender2D, EngineSchedule, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';
import { registerSimulationRuntime } from '../SimulationPluginLifecycle.js';
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
type Point = {
  readonly x: number;
  readonly y: number;
};
interface ChainBody { readonly indices: number[]; readonly fixture: boolean; readonly seed: number }
export function createChainRainPlugin(initial: ChainRainConfig = CHAIN_RAIN_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  let config = initial, mode: ChainRainMode = launch.modeId === 'build' || launch.modeId === 'interact' ? launch.modeId : 'draw', styleId = validStyle(launch.styleId) ?? CHAIN_RAIN_STYLE_MANIFEST.defaultStyleId, pendingReset = true, width = 1, height = 1, elapsed = 0, nextDemo = 0, randomState = (launch.seed ?? 1369948382) >>> 0, cleanup = (): void => undefined;
  const world = new ConstrainedCircleParticleWorld2D(131072, 262144, {}, randomState), paths = new Map<number, Point[]>(), picked = new Int32Array(2048), pickedCount = new Map<number, number>(), bodies: ChainBody[] = [];
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
          if (renderStyle === 'enhanced') {
            const dynamicBodies = bodies.filter(body => !body.fixture), fixtureBodies = bodies.filter(body => body.fixture);
            const fixtureMesh = packChainSkin(fixtureBodies, world, skin), bodyMesh = packChainSkin(dynamicBodies, world, skin);
            if (fixtureMesh.vertexCount > 0) renderer.submitTriangleMesh({ id: 'chain-rain.fixture-skin', ...fixtureMesh, worldWidth: width, worldHeight: height, palette: [[0.58, 0.58, 0.58]], opacity: 1, blend: 'opaque', shading: 'flat' });
            if (bodyMesh.vertexCount > 0) renderer.submitTriangleMesh({ id: 'chain-rain.skin', ...bodyMesh, worldWidth: width, worldHeight: height, palette: palette3, opacity: 1, blend: 'opaque', shading: 'flat' });
            const highlightWidth = chainNumber(config, 'skinHighlightWidth'), highlightOpacity = chainNumber(config, 'skinHighlightOpacity');
            if (highlightWidth > 0 && highlightOpacity > 0) {
              const strength = chainNumber(config, 'skinHighlightStrength'), highlightableFixtures = fixtureBodies.filter(body => body.indices.length > 1), highlightableBodies = dynamicBodies.filter(body => body.indices.length > 1), fixtureHighlight = packChainSkin(highlightableFixtures, world, highlightWidth), bodyHighlight = packChainSkin(highlightableBodies, world, highlightWidth);
              if (fixtureHighlight.vertexCount > 0) renderer.submitTriangleMesh({ id: 'chain-rain.fixture-highlight', ...fixtureHighlight, worldWidth: width, worldHeight: height, palette: [brightenColor([0.58, 0.58, 0.58], strength)], opacity: highlightOpacity, blend: 'alpha', shading: 'flat' });
              if (bodyHighlight.vertexCount > 0) renderer.submitTriangleMesh({ id: 'chain-rain.skin-highlight', ...bodyHighlight, worldWidth: width, worldHeight: height, palette: palette3.map(color => brightenColor(color, strength)), opacity: highlightOpacity, blend: 'alpha', shading: 'flat' });
            }
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
            const fixtures = packChainParticles(bodies.filter(body => body.fixture), world, 1.08);
            if (fixtures.count > 0) renderer.submitParticles({ id: 'chain-rain.fixtures', ...fixtures, palette: [[0.58, 0.58, 0.58, 1]], blend: 'alpha', opacity: 1 });
          } else renderer.submitParticles({
            id: 'chain-rain-nodes',
            count: world.count,
            positions: world.positions,
            radii: world.radii,
            colorSeeds: world.colorSeeds,
            palette: palette4,
            blend: 'alpha',
            opacity: 1
          });
        }
      });
      function reset() {
        world.clear(randomState);
        bodies.length = 0;
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
        renderer.setBackdrop({
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
        const indices: number[] = [], seed = bodies.length + 1;
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
          if (previous >= 0)
            world.addDistanceConstraint(previous, node, {
              restLength: Math.max(base * 0.25, (previousRadius + nodeRadius) * 0.94),
              stiffness
            });
          previous = node;
          previousRadius = nodeRadius;
        }
        if (indices.length > 0) bodies.push({ indices, fixture: false, seed });
      }
      function addFixture(path: readonly Point[]) {
        const radius = chainNumber(config, 'nodeRadius') * 2.25, samples = path.length === 1 ? [
          path[0] as Point
        ] : samplePath(path, radius * 1.35);
        const indices: number[] = [];
        for (const point of samples) {
          const index = world.addCircle(point.x, point.y, {
            radius,
            inverseMass: 0,
            colorSeed: 1
          });
          if (index >= 0) indices.push(index);
        }
        if (indices.length > 0) bodies.push({ indices, fixture: true, seed: 0 });
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
  const count = bodies.reduce((sum, body) => sum + body.indices.length, 0), positions = new Float32Array(count * 2), radii = new Float32Array(count), colorSeeds = new Float32Array(count);
  let cursor = 0;
  for (const body of bodies) for (const index of body.indices) {
    positions[cursor * 2] = world.positions[index * 2] ?? 0; positions[cursor * 2 + 1] = world.positions[index * 2 + 1] ?? 0;
    radii[cursor] = (world.radii[index] ?? 1) * radiusScale; colorSeeds[cursor] = body.seed; cursor++;
  }
  return { count, positions, radii, colorSeeds };
}

export function packChainSkin(bodies: readonly ChainBody[], world: ConstrainedCircleParticleWorld2D, widthScale: number) {
  const visible = bodies.filter(body => body.indices.length > 0), capSegments = 20;
  const vertexCount = visible.reduce((sum, body) => {
    if (body.indices.length === 1) return sum + capSegments * 3;
    const smoothPointCount = body.indices.length < 3 ? body.indices.length : (body.indices.length - 1) * skinSubdivisions(body.indices.length) + 1;
    return sum + (smoothPointCount - 1) * 6 + capSegments * 6;
  }, 0);
  const positions = new Float32Array(vertexCount * 2), colorSeeds = new Float32Array(vertexCount);
  let vertex = 0;
  const emit = (x: number, y: number, seed: number) => { positions[vertex * 2] = x; positions[vertex * 2 + 1] = y; colorSeeds[vertex] = seed; vertex++; };
  for (const body of visible) {
    const points = body.indices.map(index => ({ x: world.positions[index * 2] ?? 0, y: world.positions[index * 2 + 1] ?? 0 })), seed = body.fixture ? 0 : Math.max(0, body.seed - 1);
    let radius = 0;
    for (const index of body.indices) radius = Math.max(radius, world.radii[index] ?? 1);
    radius *= widthScale;
    if (points.length === 1) {
      emitDisk(points[0] as Point, radius, seed, capSegments, emit);
      continue;
    }
    const smooth = smoothOpenPath(points, skinSubdivisions(points.length));
    for (let i = 0; i < smooth.length - 1; i++) {
      const current = smooth[i] as Point, following = smooth[i + 1] as Point, previous = smooth[Math.max(0, i - 1)] as Point, next = smooth[Math.min(smooth.length - 1, i + 1)] as Point, afterNext = smooth[Math.min(smooth.length - 1, i + 2)] as Point;
      const currentNormal = pathNormal(previous, next), nextNormal = pathNormal(current, afterNext);
      const currentLeft = { x: current.x + currentNormal.x * radius, y: current.y + currentNormal.y * radius }, currentRight = { x: current.x - currentNormal.x * radius, y: current.y - currentNormal.y * radius };
      const nextLeft = { x: following.x + nextNormal.x * radius, y: following.y + nextNormal.y * radius }, nextRight = { x: following.x - nextNormal.x * radius, y: following.y - nextNormal.y * radius };
      emit(currentLeft.x, currentLeft.y, seed); emit(currentRight.x, currentRight.y, seed); emit(nextLeft.x, nextLeft.y, seed);
      emit(nextLeft.x, nextLeft.y, seed); emit(currentRight.x, currentRight.y, seed); emit(nextRight.x, nextRight.y, seed);
    }
    emitDisk(smooth[0] as Point, radius, seed, capSegments, emit);
    emitDisk(smooth[smooth.length - 1] as Point, radius, seed, capSegments, emit);
  }
  return { vertexCount: vertex, positions, colorSeeds };
}

function skinSubdivisions(pointCount: number) {
  return Math.max(5, Math.min(10, Math.round(pointCount * 0.32)));
}

function smoothOpenPath(points: readonly Point[], subdivisions: number): Point[] {
  if (points.length < 3) return [...points];
  const smooth: Point[] = [];
  for (let index = 0; index < points.length - 1; index++) for (let step = 0; step < subdivisions; step++) {
    const p0 = points[Math.max(0, index - 1)] as Point, p1 = points[index] as Point, p2 = points[index + 1] as Point, p3 = points[Math.min(points.length - 1, index + 2)] as Point;
    const t = step / subdivisions, t2 = t * t, t3 = t2 * t;
    smooth.push({
      x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    });
  }
  smooth.push(points[points.length - 1] as Point);
  return smooth;
}

function pathNormal(from: Point, to: Point): Point {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.max(0.001, Math.hypot(dx, dy));
  return { x: -dy / length, y: dx / length };
}

function emitDisk(center: Point, radius: number, seed: number, segments: number, emit: (x: number, y: number, seed: number) => void) {
  for (let index = 0; index < segments; index++) {
    const start = index / segments * Math.PI * 2, end = (index + 1) / segments * Math.PI * 2;
    emit(center.x, center.y, seed);
    emit(center.x + Math.cos(start) * radius, center.y + Math.sin(start) * radius, seed);
    emit(center.x + Math.cos(end) * radius, center.y + Math.sin(end) * radius, seed);
  }
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
    const thermal = ((body.seed - 1) % 4) / 3;
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
