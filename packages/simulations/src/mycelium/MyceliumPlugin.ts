import { createExtensionToken, type EnginePlugin } from '@hooksjam/gl-game-lab-core';
import { EngineGpu2D, EngineInput, EngineRender2D, EngineSchedule, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue, type GpuFieldMesh2D, type GpuFieldSystem2D, type GpuUniformEncoder2D, type GpuUniformLookup2D } from '@hooksjam/gl-game-lab-engine';
import { registerSimulationRuntime } from '../SimulationPluginLifecycle.js';
import { createMyceliumConfig, MYCELIUM_DEFAULTS, myceliumNumber, myceliumString, type MyceliumConfig } from './config.js';
import { MYCELIUM_DISPLAY_SHADER, MYCELIUM_SEED_SHADER, MYCELIUM_SPLAT_SHADER, MYCELIUM_STEP_SHADER, MYCELIUM_TRIANGLE_FRAGMENT_SHADER, MYCELIUM_TRIANGLE_VERTEX_SHADER } from './shaders.js';
import { myceliumColor3, MYCELIUM_STYLE_MANIFEST } from './styles.js';
interface Splat {
  x: number;
  y: number;
  radius: number;
  strain: number;
}
const TRIANGLE_MESH_MAX_CELLS = 900_000;
const EMPTY_TRIANGLE_MESH: GpuFieldMesh2D = Object.freeze({
  vertexCount: 0,
  positions: new Float32Array(0),
  cells: new Float32Array(0),
  facets: new Float32Array(0),
});
export interface MyceliumController extends ExperienceRuntimeController {
  readonly fieldResolution: number;
}
export const MyceliumControllerService = createExtensionToken<MyceliumController>('gl-game-lab.simulations.mycelium.controller');
export const MYCELIUM_PLUGIN_ID = 'gl-game-lab.simulations.mycelium';
export function createMyceliumPlugin(initial: MyceliumConfig = MYCELIUM_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  let config = initial, styleId = validStyle(launch.styleId) ?? MYCELIUM_STYLE_MANIFEST.defaultStyleId, pendingDt = 0, elapsed = 0, randomState = seedValue(launch.seed), rebuild = false, needsSeed = true, fieldViewportWidth = 0, fieldViewportHeight = 0, paintPointerId: number | undefined, paintPointer: { x: number; y: number } | undefined, cleanup = (): void => undefined;
  const splats: Splat[] = [];
  const paletteData = new Float32Array(24), backgroundData = new Float32Array(3);
  return {
    id: MYCELIUM_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: context => {
      const renderer = context.get(EngineRender2D), gpu = context.get(EngineGpu2D), input = context.get(EngineInput);
      let field = createField(), triangleMesh = createTriangleMesh(field.width, field.height), observedGeneration = field.generation;
      cleanup = () => { field.dispose(); };
      applyStyle();
      const controller: MyceliumController = {
        get modeId() {
          return 'paint';
        },
        get styleId() {
          return styleId;
        },
        get settings() {
          return Object.freeze({
            ...config
          });
        },
        get fieldResolution() {
          return field.width;
        },
        get entityCount() {
          return field.width * field.height;
        },
        setMode: value => {
          if (value !== 'paint')
            throw new Error(`Unknown Mycelium mode: ${value}`);
        },
        setStyle: value => {
          const next = validStyle(value);
          if (!next)
            throw new Error(`Unknown Mycelium style: ${value}`);
          styleId = next;
          applyStyle();
        },
        setSetting: (key, value) => {
          const oldResolution = myceliumNumber(config, 'resolution'), oldTopology = myceliumString(config, 'topology');
          config = createMyceliumConfig({
            ...record(),
            [key]: value
          });
          rebuild ||= oldResolution !== myceliumNumber(config, 'resolution') || oldTopology !== myceliumString(config, 'topology');
        },
        reset: () => {
          field.clear();
          randomState = seedValue(launch.seed);
          resetCpuState();
        }
      };
      registerSimulationRuntime(context, MyceliumControllerService, controller, () => {
        cleanup();
        splats.length = 0;
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.mycelium.update',
        stage: 'update',
        run: ({ time }) => {
          const dt = Math.min(0.05, time.deltaSeconds) * myceliumNumber(config, 'timeScale');
          const viewportWidth = Math.max(1, renderer.viewport.width);
          const viewportHeight = Math.max(1, renderer.viewport.height);
          if (Math.abs(viewportWidth / viewportHeight - fieldViewportWidth / Math.max(1, fieldViewportHeight)) > 0.01) rebuild = true;
          pendingDt += dt;
          elapsed += dt;
          for (const event of input.snapshot.events) {
            if (event.kind !== 'pointer') continue;
            if (event.phase === 'down') {
              paintPointerId = event.id;
              paintPointer = normalizePaintPoint(event.x, event.y);
              queuePaintSplat(paintPointer, false);
            } else if (event.phase === 'move' && event.id === paintPointerId && event.buttons !== 0) {
              paintPointer = normalizePaintPoint(event.x, event.y);
              queuePaintSplat(paintPointer, true);
            } else if ((event.phase === 'up' || event.phase === 'cancel') && event.id === paintPointerId) {
              paintPointerId = undefined;
              paintPointer = undefined;
            }
          }
          const heldPointer = paintPointerId === undefined ? undefined : input.snapshot.pointers.find(pointer => pointer.id === paintPointerId && pointer.buttons !== 0);
          if (heldPointer) {
            paintPointer = normalizePaintPoint(heldPointer.x, heldPointer.y);
            queuePaintSplat(paintPointer, true);
          } else if (paintPointerId !== undefined) {
            paintPointerId = undefined;
            paintPointer = undefined;
          }
          if ((launch.profile === 'preview' || launch.profile === 'demo') && input.snapshot.pointers.length === 0 && Math.floor((elapsed - dt) * 1.2) !== Math.floor(elapsed * 1.2))
            splats.push({
              x: 0.12 + nextRandom() * 0.76,
              y: 0.12 + nextRandom() * 0.76,
              radius: myceliumNumber(config, 'demoSeedRadius') * 1.4,
              strain: nextRandom()
            });
        }
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.mycelium.render',
        stage: 'renderExtract',
        run: () => {
          gpu.submit('mycelium.cellular-field', destination => {
              if (field.generation !== observedGeneration) {
                observedGeneration = field.generation;
                randomState = seedValue(launch.seed);
                resetCpuState();
              }
              if (rebuild) {
                field.dispose();
                field = createField();
                triangleMesh = createTriangleMesh(field.width, field.height);
                observedGeneration = field.generation;
                rebuild = false;
                needsSeed = true;
              }
              if (needsSeed) {
                const configured = Math.round(myceliumNumber(config, 'demoSeedColonies')), colonies = configured > 0 ? configured : (launch.profile === 'preview' || launch.profile === 'demo' ? 4 : 0);
                field.step('seed', (g, u) => {
                  g.uniform1f(u('uSeed'), nextRandom() * 1000);
                  g.uniform1i(u('uColonies'), colonies);
                  g.uniform1f(u('uSeedRadius'), myceliumNumber(config, 'demoSeedRadius'));
                });
                needsSeed = false;
              }
              const dt = pendingDt;
              pendingDt = 0;
              if (dt > 0) {
                const steps = Math.max(1, Math.min(launch.profile === 'preview' ? 2 : 8, Math.ceil(dt * 72)));
                for (let index = 0; index < steps; index++)
                  field.step('step', (g, u) => {
                    g.uniform2f(u('uTexel'), 1 / field.width, 1 / field.height);
                    g.uniform2f(u('uGrid'), field.width, field.height);
                    g.uniform1f(u('uGrowthRate'), myceliumNumber(config, 'growthRate'));
                    g.uniform1f(u('uDecayRate'), myceliumNumber(config, 'pruneRate'));
                    g.uniform1f(u('uBranchChance'), myceliumNumber(config, 'branchChance'));
                    g.uniform1f(u('uOverwriteChance'), myceliumNumber(config, 'overwriteChance'));
                    g.uniform1f(u('uClumping'), myceliumNumber(config, 'growthClumping'));
                    g.uniform1f(u('uColorMutation'), myceliumNumber(config, 'colorMutation'));
                    g.uniform1f(u('uColorDriftFrequency'), myceliumNumber(config, 'colorDriftFrequency'));
                    g.uniform1f(u('uBranchColorSplit'), myceliumNumber(config, 'branchColorSplit'));
                    g.uniform1f(u('uSubstrateColorBias'), myceliumNumber(config, 'substrateColorBias'));
                    g.uniform1f(u('uTime'), elapsed + index * 0.01);
                    g.uniform1i(u('uVariant'), myceliumString(config, 'topology') === 'triangle' ? 0 : 1);
                  });
              }
              for (const splat of splats.splice(0))
                field.step('splat', (g, u) => {
                  g.uniform2f(u('uPoint'), splat.x, splat.y);
                  g.uniform1f(u('uRadius'), splat.radius);
                  g.uniform1f(u('uStrain'), splat.strain);
                });
              const bindDisplay = (g: GpuUniformEncoder2D, u: GpuUniformLookup2D) => {
                g.uniform2f(u('uGrid'), field.width, field.height);
                g.uniform3fv(u('uPalette[0]'), paletteData);
                g.uniform3fv(u('uBackground'), backgroundData);
                g.uniform1i(u('uVariant'), myceliumString(config, 'topology') === 'triangle' ? 0 : 1);
                const visual = myceliumString(config, 'renderStyle');
                g.uniform1i(u('uVisualStyle'), visual === 'basic' ? 0 : visual === 'enhanced' ? 1 : 2);
                g.uniform1f(u('uFieldSpread'), myceliumNumber(config, 'fieldSpread'));
              };
              if (myceliumString(config, 'topology') === 'triangle' && triangleMesh.vertexCount > 0) field.renderMesh('triangles', destination, triangleMesh, bindDisplay);
              else field.render('display', destination, bindDisplay);
          });
        }
      });
      function createField(): GpuFieldSystem2D {
        fieldViewportWidth = Math.max(1, renderer.viewport.width);
        fieldViewportHeight = Math.max(1, renderer.viewport.height);
        const requested = myceliumNumber(config, 'resolution'), resolution = launch.profile === 'preview' ? Math.min(256, requested) : requested;
        const triangleRowScale = myceliumString(config, 'topology') === 'triangle' ? 1 / Math.sqrt(3) : 1;
        const aspect = fieldViewportHeight / fieldViewportWidth * triangleRowScale;
        return gpu.createFieldSystem(`${MYCELIUM_PLUGIN_ID}.field`, {
          width: Math.round(resolution),
          height: Math.max(24, Math.round(resolution * Math.max(0.35, aspect))),
          precision: 'half-float',
          filter: 'nearest',
          passes: { seed: MYCELIUM_SEED_SHADER, step: MYCELIUM_STEP_SHADER, splat: MYCELIUM_SPLAT_SHADER, display: MYCELIUM_DISPLAY_SHADER },
          meshPasses: { triangles: { vertexSource: MYCELIUM_TRIANGLE_VERTEX_SHADER, fragmentSource: MYCELIUM_TRIANGLE_FRAGMENT_SHADER } }
        });
      }
      function resetCpuState(): void {
        splats.length = 0; needsSeed = true; pendingDt = 0; elapsed = 0; paintPointerId = undefined; paintPointer = undefined;
      }
      function applyStyle() {
        const style = requireStyle(), background = myceliumColor3(style.background);
        style.palette.slice(0, 8).forEach((color, index) => paletteData.set(myceliumColor3(color), index * 3));
        backgroundData.set(background);
        renderer.setClearColor([
          background[0],
          background[1],
          background[2],
          1
        ]);
        renderer.setBackdrop(undefined);
        renderer.setBloom({
          enabled: false
        });
      }
      function normalizePaintPoint(x: number, y: number): { x: number; y: number } {
        const width = Math.max(1, renderer.viewport.width), height = Math.max(1, renderer.viewport.height);
        return {
          x: Math.max(0, Math.min(1, x / width)),
          y: Math.max(0, Math.min(1, 1 - y / height)),
        };
      }
      function queuePaintSplat(point: { x: number; y: number }, drag: boolean): void {
        splats.push({
          x: point.x,
          y: point.y,
          radius: myceliumNumber(config, 'brushRadius') * (drag ? 1.35 : 1),
          strain: nextRandom(),
        });
      }
    }
  };
  function requireStyle() {
    const style = MYCELIUM_STYLE_MANIFEST.styles.find(candidate => candidate.id === styleId);
    if (!style)
      throw new Error(`Unknown Mycelium style: ${styleId}`);
    return style;
  }
  function record(): Readonly<Record<string, ExperienceSettingValue>> {
    return Object.freeze({
      ...config
    });
  }
  function nextRandom() {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) / 4294967296;
  }
}

function createTriangleMesh(cols: number, rows: number): GpuFieldMesh2D {
  const renderCols = cols + 1, cellCount = renderCols * rows, vertexCount = cellCount * 3;
  if (cellCount > TRIANGLE_MESH_MAX_CELLS) return EMPTY_TRIANGLE_MESH;
  const positions = new Float32Array(vertexCount * 2), cells = new Float32Array(vertexCount * 2), facets = new Float32Array(vertexCount);
  const half = 2 / Math.max(1, cols), side = half * 2, cellHeight = 2 / Math.max(1, rows), scale = 1.002;
  for (let i = 0; i < cellCount; i++) {
    const renderColumn = i % renderCols, row = Math.floor(i / renderCols), dataRow = rows - 1 - row;
    const bx = -1 + (renderColumn - 1) * half, top = 1 - row * cellHeight, bottom = 1 - (row + 1) * cellHeight;
    const apexUp = (renderColumn + dataRow) % 2 === 0;
    const points: readonly [readonly [number, number], readonly [number, number], readonly [number, number]] = apexUp
      ? [[bx, bottom], [bx + half, top], [bx + side, bottom]]
      : [[bx, top], [bx + side, top], [bx + half, bottom]];
    const cx = (points[0][0] + points[1][0] + points[2][0]) / 3, cy = (points[0][1] + points[1][1] + points[2][1]) / 3;
    const dataCol = Math.max(0, Math.min(cols - 1, renderColumn - 1));
    for (let corner = 0; corner < 3; corner++) {
      const vertex = i * 3 + corner, point = points[corner];
      positions[vertex * 2] = cx + ((point?.[0] ?? cx) - cx) * scale;
      positions[vertex * 2 + 1] = cy + ((point?.[1] ?? cy) - cy) * scale;
      cells[vertex * 2] = dataCol; cells[vertex * 2 + 1] = dataRow; facets[vertex] = 1;
    }
  }
  return { vertexCount, positions, cells, facets };
}
function validStyle(value: string | undefined) {
  return value && MYCELIUM_STYLE_MANIFEST.styles.some(style => style.id === value) ? value : undefined;
}
function seedValue(seed: number | undefined) {
  const value = seed ?? 260618;
  if (!Number.isSafeInteger(value))
    throw new Error('Mycelium seed must be a safe integer');
  return (value >>> 0) || 260618;
}
