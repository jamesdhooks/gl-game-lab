import { createExtensionToken, type EnginePlugin, type PointerInputEvent } from '@hooksjam/gl-game-lab-core';
import { EngineGpu2D, EngineInput, EngineRender2D, EngineSchedule, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue, type FluidField2D, type FluidSplat2D, type GpuParticleSystem2D, type GpuRenderTarget2D } from '@hooksjam/gl-game-lab-engine';
import { registerSimulationRuntime } from '../SimulationPluginLifecycle.js';
import { createParticleFluidConfig, PARTICLE_FLUID_DEFAULTS, particleFluidNumber, particleFluidString, type ParticleFluidConfig } from './config.js';
import { PARTICLE_FLUID_FRAGMENT_SHADER, PARTICLE_FLUID_STEP_SHADER, PARTICLE_FLUID_VERTEX_SHADER } from './shaders.js';
import { particleFluidFieldSize, particleFluidFlowScale, particleFluidSeedPosition, particleFluidUvToSimulation } from './motion.js';
import { particleFluidColor3, PARTICLE_FLUID_STYLE_MANIFEST } from './styles.js';
export interface ParticleFluidController extends ExperienceRuntimeController {
  readonly particleCapacity: number;
  readonly fieldResolution: number;
}
export const ParticleFluidControllerService = createExtensionToken<ParticleFluidController>('gl-game-lab.simulations.particle-fluid.controller');
export const PARTICLE_FLUID_PLUGIN_ID = 'gl-game-lab.simulations.particle-fluid';
export function createParticleFluidPlugin(initial: ParticleFluidConfig = PARTICLE_FLUID_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  let config = initial, styleId = validStyle(launch.styleId) ?? PARTICLE_FLUID_STYLE_MANIFEST.defaultStyleId, pendingDt = 0, autoAngle = 0, rebuildParticles = false, rebuildField = false, pointerActive = false, pulseX = 0, pulseY = 0, pulsePreviousX = 0, pulsePreviousY = 0, pulseAge = 999, pulseSpeed = 0, pulseStrength = 0, colorCacheKey = '', colorCache: ParticleRenderColors | undefined, cleanup = (): void => undefined;
  const splats: FluidSplat2D[] = [], previous = new Map<number, {
    x: number;
    y: number;
  }>(), pulseSegmentUniform = new Float32Array(4), pulseParamsUniform = new Float32Array(4);
  return {
    id: PARTICLE_FLUID_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: context => {
      const renderer = context.get(EngineRender2D), gpu = context.get(EngineGpu2D), input = context.get(EngineInput);
      let aspect = viewportAspect(), fieldViewportWidth = 0, fieldViewportHeight = 0;
      let particles = createParticles(), flow = createFlow(), observedGeneration = particles.generation;
      cleanup = () => { particles.dispose(); flow.dispose(); };
      applyStyle();
      const controller: ParticleFluidController = {
        get modeId() {
          return 'stir';
        },
        get styleId() {
          return styleId;
        },
        get settings() {
          return Object.freeze({
            ...config
          });
        },
        get particleCapacity() {
          return particles.capacity;
        },
        get fieldResolution() {
          return flow.width;
        },
        get entityCount() {
          return particles.capacity;
        },
        setMode: value => {
          if (value !== 'stir')
            throw new Error(`Unknown Particle Fluid mode: ${value}`);
        },
        setStyle: value => {
          const next = validStyle(value);
          if (!next)
            throw new Error(`Unknown Particle Fluid style: ${value}`);
          styleId = next;
          applyStyle();
        },
        setSetting: (key, value) => {
          config = createParticleFluidConfig({
            ...record(),
            [key]: value
          });
          if (!PARTICLE_FLUID_VISUAL_SETTINGS.has(key)) {
            rebuildParticles = true;
            rebuildField = true;
            resetCpuState();
          }
          applyStyle();
        },
        reset: resetSimulation
      };
      registerSimulationRuntime(context, ParticleFluidControllerService, controller, () => {
        cleanup();
        splats.length = 0;
        previous.clear();
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.particle-fluid.update',
        stage: 'update',
        run: ({ time }) => {
          const dt = Math.min(1 / 30, time.deltaSeconds);
          pendingDt += dt;
          pulseAge += dt;
          pointerActive = input.snapshot.pointers.length > 0;
          for (const event of input.snapshot.events)
            if (event.kind === 'pointer')
              routePointer(event, dt);
          const pixelRatio = renderer.viewport.pixelRatio ?? 1;
          const viewportWidth = renderer.viewport.width * pixelRatio, viewportHeight = renderer.viewport.height * pixelRatio;
          if (viewportWidth !== fieldViewportWidth || viewportHeight !== fieldViewportHeight)
            rebuildField = true;
          if (!pointerActive && dt > 0) {
            autoAngle += dt * 1.1;
            const sweep = Math.sin(autoAngle * 0.37), x = 0.5 + Math.sin(autoAngle * 0.74) * 0.28, y = 0.5 - Math.cos(autoAngle * 0.58) * 0.24;
            queueForce(x, y, x - Math.cos(autoAngle * 1.7) * 0.018, y + Math.sin(autoAngle * 1.35) * 0.016, sweep > 0.62 ? 1.55 : 1, dt);
          }
        }
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.particle-fluid.render',
        stage: 'renderExtract',
        run: () => gpu.submit('particle-fluid.gpu-advection', destination => {
            if (particles.generation !== observedGeneration) { observedGeneration = particles.generation; resetCpuState(); }
            if (rebuildParticles) {
              particles.dispose();
              particles = createParticles();
              observedGeneration = particles.generation;
              rebuildParticles = false;
            }
            if (rebuildField) {
              flow.dispose();
              flow = createFlow();
              rebuildField = false;
            }
            const dt = pendingDt;
            pendingDt = 0;
            if (dt > 0) {
              flow.step({
                deltaSeconds: dt,
                viscosity: 0,
                curl: 0,
                velocityDissipation: 0,
                dyeDissipation: 2,
                pressureIterations: particleFluidNumber(config, 'solverIterations'),
                ambient: false,
                velocitySplatsBeforeProjection: true,
                solverMode: 'source-mapped',
                cellSize: particleFluidNumber(config, 'cellSize'),
                simulationScale: particleFluidNumber(config, 'simulationScale'),
                velocityDecay: particleFluidNumber(config, 'velocityDecay'),
                forceRadius: particleFluidNumber(config, 'forceRadius'),
                forceTaper: particleFluidNumber(config, 'forceTaper'),
                forceStrength: particleFluidNumber(config, 'forceStrength')
              }, splats.splice(0));
              particles.step((g, u) => {
                g.uniformTexture(u('uFlowField'), flow.texture('velocity'), 2);
                g.uniform1i(u('uCapacity'), particles.capacity);
                g.uniform1f(u('uDt'), dt);
                g.uniform1f(u('uParticleDrag'), particleFluidNumber(config, 'particleDrag'));
                const flowScale = particleFluidFlowScale(particleFluidNumber(config, 'cellSize'), aspect, particleFluidNumber(config, 'simulationScale'));
                g.uniform2f(u('uFlowScale'), flowScale[0], flowScale[1]);
              });
            }
            const style = requireStyle(), enhanced = particleFluidString(config, 'renderStyle') === 'enhanced', scale = destination.height / Math.max(1, renderer.viewport.height), nextColorKey = `${styleId}:${enhanced ? 'enhanced' : 'basic'}`;
            if (!colorCache || colorCacheKey !== nextColorKey) { colorCache = particleRenderColors(style.palette, enhanced); colorCacheKey = nextColorKey; }
            draw(destination, colorCache, particleFluidNumber(config, 'pointSize') * scale, enhanced);
        })
      });
      function draw(destination: GpuRenderTarget2D, colors: ParticleRenderColors, size: number, enhanced: boolean) {
        const fade = enhanced ? Math.max(0, Math.min(1, 1 - pulseAge / 1.65)) * pulseStrength * particleFluidNumber(config, 'pulseStrength') : 0;
        pulseSegmentUniform.set([pulseX, pulseY, pulsePreviousX, pulsePreviousY]);
        pulseParamsUniform.set([particleFluidNumber(config, 'forceRadius') * particleFluidNumber(config, 'simulationScale') * 1.75, fade, pulseSpeed, pulseAge]);
        particles.render(destination, (g, u) => {
          g.uniform1f(u('uPointSize'), size);
          g.uniform1f(u('uSpeedColorScale'), particleFluidNumber(config, 'colorSpeedScale'));
          g.uniform3fv(u('uSlowColor'), colors.slow);
          g.uniform3fv(u('uFastColor'), colors.fast);
          g.uniform3fv(u('uHotColor'), colors.hot);
          g.uniform3fv(u('uPulseColor'), colors.pulse);
          g.uniform1f(u('uBloomStrength'), enhanced ? particleFluidNumber(config, 'bloomStrength') : 0);
          g.uniform1f(u('uEnhanced'), enhanced ? 1 : 0);
          g.uniform1f(u('uAspectRatio'), aspect);
          g.uniform1f(u('uSimulationScale'), particleFluidNumber(config, 'simulationScale'));
          g.uniform4fv(u('uPulseSegment'), pulseSegmentUniform);
          g.uniform4fv(u('uPulseParams'), pulseParamsUniform);
        });
      }
      function routePointer(event: PointerInputEvent, dt: number) {
        const width = Math.max(1, renderer.viewport.width), height = Math.max(1, renderer.viewport.height), x = event.x / width, y = 1 - event.y / height;
        if (event.phase === 'up' || event.phase === 'cancel') {
          previous.delete(event.id);
          return;
        }
        const prior = previous.get(event.id) ?? { x: event.x, y: event.y };
        previous.set(event.id, {
          x: event.x,
          y: event.y
        });
        queueForce(x, y, prior.x / width, 1 - prior.y / height, 1, dt);
      }
      function queueForce(x: number, y: number, priorX: number, priorY: number, strength: number, dt: number) {
        const safeDt = Math.max(0.0001, dt);
        splats.push({
          x,
          y,
          previousX: priorX,
          previousY: priorY,
          radius: particleFluidNumber(config, 'forceRadius'),
          aspectRatio: aspect,
          taper: particleFluidNumber(config, 'forceTaper'),
          strength,
          velocityMode: 'target',
          velocityX: (x - priorX) / safeDt,
          velocityY: (y - priorY) / safeDt,
          dye: [0, 0, 0],
          amount: 0
        });
        const simulationScale = particleFluidNumber(config, 'simulationScale');
        const current = particleFluidUvToSimulation(x, y, aspect, simulationScale), prior = particleFluidUvToSimulation(priorX, priorY, aspect, simulationScale);
        pulseX = current[0]; pulseY = current[1]; pulsePreviousX = prior[0]; pulsePreviousY = prior[1];
        pulseSpeed = Math.hypot((current[0] - prior[0]) / simulationScale, (current[1] - prior[1]) / simulationScale) / safeDt * strength;
        pulseStrength = Math.max(0, Math.min(2, strength));
        pulseAge = 0;
      }
      function createParticles(): GpuParticleSystem2D {
        const requested = Math.round(particleFluidNumber(config, 'maxParticles')), capacity = launch.profile === 'preview' ? Math.min(8192, requested) : requested, next = gpu.createParticleSystem(`${PARTICLE_FLUID_PLUGIN_ID}.particles`, {
          capacity,
          precision: 'float',
          simulationFragmentSource: PARTICLE_FLUID_STEP_SHADER,
          particleVertexSource: PARTICLE_FLUID_VERTEX_SHADER,
          particleFragmentSource: PARTICLE_FLUID_FRAGMENT_SHADER,
          blend: 'additive',
        }), positions = new Float32Array(next.width * next.height * 4), velocities = new Float32Array(positions.length);
        for (let i = 0; i < next.capacity; i++) {
          const o = i * 4, position = particleFluidSeedPosition(i, next.capacity);
          positions[o] = position[0];
          positions[o + 1] = position[1];
          positions[o + 2] = 0;
          positions[o + 3] = 1;
          velocities[o] = 0;
          velocities[o + 1] = 0;
          velocities[o + 2] = 0;
          velocities[o + 3] = 1;
        }
        next.uploadSeed({
          positions,
          velocities
        });
        return next;
      }
      function createFlow(): FluidField2D {
        const pixelRatio = renderer.viewport.pixelRatio ?? 1;
        fieldViewportWidth = renderer.viewport.width * pixelRatio;
        fieldViewportHeight = renderer.viewport.height * pixelRatio;
        const size = particleFluidFieldSize(fieldViewportWidth, fieldViewportHeight, particleFluidNumber(config, 'fieldCellSize'), launch.profile === 'preview');
        aspect = size[0] / Math.max(1, size[1]);
        return renderer.createFluidField(`${PARTICLE_FLUID_PLUGIN_ID}.flow`, size[0], size[1], {
          simulationPrecision: 'float',
          simulationFilter: 'nearest'
        });
      }
      function resetSimulation() {
        particles.dispose();
        flow.dispose();
        particles = createParticles();
        flow = createFlow();
        observedGeneration = particles.generation;
        resetCpuState();
      }
      function resetCpuState() {
        splats.length = 0;
        previous.clear();
        pendingDt = 0;
        autoAngle = 0;
        pointerActive = false;
        pulseX = 0; pulseY = 0; pulsePreviousX = 0; pulsePreviousY = 0;
        pulseAge = 999; pulseSpeed = 0; pulseStrength = 0;
      }
      function applyStyle() {
        const style = requireStyle(), background = particleFluidColor3(style.background);
        renderer.setClearColor([
          background[0],
          background[1],
          background[2],
          1
        ]);
        renderer.setBackdrop(undefined);
        renderer.setBloom({ enabled: false, intensity: 0 });
      }
      function requireStyle() {
        const style = PARTICLE_FLUID_STYLE_MANIFEST.styles.find(candidate => candidate.id === styleId);
        if (!style)
          throw new Error(`Unknown Particle Fluid style: ${styleId}`);
        return style;
      }
      function viewportAspect() {
        return renderer.viewport.width / Math.max(1, renderer.viewport.height);
      }
      function record(): Readonly<Record<string, ExperienceSettingValue>> {
        return Object.freeze({
          ...config
        });
      }
    }
  };
}
function validStyle(value: string | undefined) {
  return value && PARTICLE_FLUID_STYLE_MANIFEST.styles.some(style => style.id === value) ? value : undefined;
}
interface ParticleRenderColors { readonly slow: Float32Array; readonly fast: Float32Array; readonly hot: Float32Array; readonly pulse: Float32Array }
const PARTICLE_FLUID_VISUAL_SETTINGS = new Set(['renderStyle', 'bloomStrength', 'pulseStrength', 'pointSize', 'colorSpeedScale']);
function particleRenderColors(palette: readonly number[], enhanced: boolean): ParticleRenderColors {
  const color = (index: number) => particleFluidColor3(palette[index] ?? palette[palette.length - 1] ?? 0xffffff);
  const readable = (source: readonly [number, number, number], minimumLuma: number, boost: number) => {
    const values: [number, number, number] = [Math.min(1, source[0] * boost), Math.min(1, source[1] * boost), Math.min(1, source[2] * boost)];
    const luma = values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    if (luma < minimumLuma) {
      const lift = minimumLuma - luma;
      values[0] = Math.min(1, values[0] + lift * (1 - values[0]));
      values[1] = Math.min(1, values[1] + lift * (1 - values[1]));
      values[2] = Math.min(1, values[2] + lift * (1 - values[2]));
    }
    return values;
  };
  return {
    slow: new Float32Array(enhanced ? readable(color(0), 0.2, 1.18) : color(0)),
    fast: new Float32Array(enhanced ? readable(color(1), 0.46, 1.12) : color(1)),
    hot: new Float32Array(enhanced ? readable(color(2), 0.68, 1.08) : color(2)),
    pulse: new Float32Array(color(3))
  };
}
