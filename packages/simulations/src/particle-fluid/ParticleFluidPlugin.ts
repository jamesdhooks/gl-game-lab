import { createExtensionToken, type EnginePlugin, type PointerInputEvent } from '@hooksjam/gl-game-lab-core';
import { EngineGpu2D, EngineInput, EngineRender2D, EngineSchedule, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue, type FluidField2D, type FluidSplat2D, type GpuParticleSystem2D, type GpuRenderTarget2D } from '@hooksjam/gl-game-lab-engine';
import { registerSimulationRuntime } from '../SimulationPluginLifecycle.js';
import { createParticleFluidConfig, PARTICLE_FLUID_DEFAULTS, particleFluidNumber, particleFluidString, type ParticleFluidConfig } from './config.js';
import { PARTICLE_FLUID_FRAGMENT_SHADER, PARTICLE_FLUID_STEP_SHADER, PARTICLE_FLUID_VERTEX_SHADER } from './shaders.js';
import { particleFluidColor3, PARTICLE_FLUID_STYLE_MANIFEST } from './styles.js';
export interface ParticleFluidController extends ExperienceRuntimeController {
  readonly particleCapacity: number;
  readonly fieldResolution: number;
}
export const ParticleFluidControllerService = createExtensionToken<ParticleFluidController>('gl-game-lab.simulations.particle-fluid.controller');
export const PARTICLE_FLUID_PLUGIN_ID = 'gl-game-lab.simulations.particle-fluid';
export function createParticleFluidPlugin(initial: ParticleFluidConfig = PARTICLE_FLUID_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  let config = initial, styleId = validStyle(launch.styleId) ?? PARTICLE_FLUID_STYLE_MANIFEST.defaultStyleId, pendingDt = 0, elapsed = 0, rebuildParticles = false, rebuildField = false, pointerActive = false, pointerX = 0.5, pointerY = 0.5, randomState = (launch.seed ?? 260706) >>> 0, cleanup = (): void => undefined;
  const splats: FluidSplat2D[] = [], previous = new Map<number, {
    x: number;
    y: number;
  }>();
  return {
    id: PARTICLE_FLUID_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: context => {
      const renderer = context.get(EngineRender2D), gpu = context.get(EngineGpu2D), input = context.get(EngineInput);
      let aspect = viewportAspect();
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
          const oldParticles = particleFluidNumber(config, 'maxParticles'), oldCell = particleFluidNumber(config, 'fieldCellSize');
          config = createParticleFluidConfig({
            ...record(),
            [key]: value
          });
          rebuildParticles ||= oldParticles !== particleFluidNumber(config, 'maxParticles');
          rebuildField ||= oldCell !== particleFluidNumber(config, 'fieldCellSize');
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
          elapsed += dt;
          pointerActive = input.snapshot.pointers.length > 0;
          for (const event of input.snapshot.events)
            if (event.kind === 'pointer')
              routePointer(event);
          const nextAspect = viewportAspect();
          if (Math.abs(nextAspect - aspect) > 0.04)
            rebuildField = true;
          if ((launch.profile === 'preview' || launch.profile === 'demo') && !pointerActive && dt > 0) {
            const angle = elapsed * 0.91, x = 0.5 + Math.cos(angle * 0.73) * 0.28, y = 0.5 + Math.sin(angle) * 0.3;
            pointerX = x;
            pointerY = y;
            splats.push({
              x,
              y,
              radius: particleFluidNumber(config, 'forceRadius') * 2.3,
              velocityX: Math.cos(angle * 1.7) * 0.32,
              velocityY: Math.sin(angle * 1.35) * 0.29,
              dye: [
                0,
                0,
                0
              ],
              amount: 0
            });
          }
        }
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.particle-fluid.render',
        stage: 'renderExtract',
        run: () => gpu.submit('particle-fluid.gpu-advection', destination => {
            if (particles.generation !== observedGeneration) { observedGeneration = particles.generation; randomState = (launch.seed ?? 260706) >>> 0; resetCpuState(); }
            if (rebuildParticles) {
              particles.dispose();
              particles = createParticles();
              observedGeneration = particles.generation;
              rebuildParticles = false;
            }
            if (rebuildField) {
              flow.dispose();
              flow = createFlow();
              aspect = viewportAspect();
              rebuildField = false;
            }
            const dt = pendingDt;
            pendingDt = 0;
            if (dt > 0) {
              flow.step({
                deltaSeconds: dt,
                viscosity: 0.08,
                curl: 22,
                velocityDissipation: (1 - particleFluidNumber(config, 'velocityDecay')) * 60,
                dyeDissipation: 2,
                pressureIterations: launch.profile === 'preview' ? Math.min(10, particleFluidNumber(config, 'solverIterations')) : particleFluidNumber(config, 'solverIterations'),
                ambient: false
              }, splats.splice(0));
              particles.step((g, u) => {
                g.uniformTexture(u('uFlowField'), flow.texture('velocity'), 2);
                g.uniform1i(u('uCapacity'), particles.capacity);
                g.uniform1f(u('uDt'), dt);
                g.uniform1f(u('uParticleDrag'), particleFluidNumber(config, 'particleDrag'));
                g.uniform1f(u('uSimulationScale'), particleFluidNumber(config, 'simulationScale'));
              });
            }
            const style = requireStyle(), palette = new Float32Array(12);
            style.palette.slice(0, 4).forEach((color, index) => palette.set(particleFluidColor3(color), index * 3));
            const enhanced = particleFluidString(config, 'renderStyle') === 'enhanced', visual = visualProfile(styleId), scale = Math.max(1, destination.height / 720);
            if (enhanced)
              draw(destination, palette, particleFluidNumber(config, 'pointSize') * scale * visual.pointScale * 2.6, 0.12, particleFluidNumber(config, 'bloomStrength') * visual.bloom * 1.7);
            draw(destination, palette, particleFluidNumber(config, 'pointSize') * scale * visual.pointScale, enhanced ? 0.72 : 0.9, enhanced ? 1.35 : 1);
        })
      });
      function draw(destination: GpuRenderTarget2D, palette: Float32Array, size: number, opacity: number, brightness: number) {
        particles.render(destination, (g, u) => {
          g.uniform1f(u('uPointSize'), size);
          g.uniform1f(u('uSpeedColorScale'), particleFluidNumber(config, 'colorSpeedScale'));
          g.uniform1f(u('uPointerActive'), pointerActive ? 1 : 0);
          g.uniform2f(u('uPointer'), pointerX, pointerY);
          g.uniform1f(u('uPointerRadius'), particleFluidNumber(config, 'forceRadius') * 2.2);
          g.uniform1f(u('uPulseStrength'), particleFluidString(config, 'renderStyle') === 'enhanced' ? particleFluidNumber(config, 'pulseStrength') : 0);
          g.uniform3fv(u('uPalette[0]'), palette);
          g.uniform1i(u('uPaletteCount'), Math.min(4, requireStyle().palette.length));
          g.uniform1f(u('uOpacity'), opacity);
          g.uniform1f(u('uBrightness'), brightness);
        });
      }
      function routePointer(event: PointerInputEvent) {
        const width = Math.max(1, renderer.viewport.width), height = Math.max(1, renderer.viewport.height), x = event.x / width, y = 1 - event.y / height;
        if (event.phase === 'up' || event.phase === 'cancel') {
          previous.delete(event.id);
          return;
        }
        const prior = previous.get(event.id) ?? {
          x: event.x,
          y: event.y
        }, dx = (event.x - prior.x) / width, dy = -(event.y - prior.y) / height, force = particleFluidNumber(config, 'forceStrength'), taper = 0.4 + 0.6 * particleFluidNumber(config, 'forceTaper');
        pointerX = x;
        pointerY = y;
        previous.set(event.id, {
          x: event.x,
          y: event.y
        });
        splats.push({
          x,
          y,
          radius: particleFluidNumber(config, 'forceRadius') * particleFluidNumber(config, 'simulationScale'),
          velocityX: dx * force * 18 * taper + (event.phase === 'down' ? (random() - 0.5) * 0.35 : 0),
          velocityY: dy * force * 18 * taper + (event.phase === 'down' ? (random() - 0.5) * 0.35 : 0),
          dye: [
            0,
            0,
            0
          ],
          amount: 0
        });
      }
      function createParticles(): GpuParticleSystem2D {
        const requested = Math.round(particleFluidNumber(config, 'maxParticles')), capacity = launch.profile === 'preview' ? Math.min(65536, requested) : requested, next = gpu.createParticleSystem(`${PARTICLE_FLUID_PLUGIN_ID}.particles`, {
          capacity,
          precision: 'float',
          simulationFragmentSource: PARTICLE_FLUID_STEP_SHADER,
          particleVertexSource: PARTICLE_FLUID_VERTEX_SHADER,
          particleFragmentSource: PARTICLE_FLUID_FRAGMENT_SHADER,
          blend: 'additive',
        }), positions = new Float32Array(next.width * next.height * 4), velocities = new Float32Array(positions.length);
        for (let i = 0; i < next.capacity; i++) {
          const o = i * 4, grid = Math.ceil(Math.sqrt(next.capacity)), column = i % grid, row = Math.floor(i / grid);
          positions[o] = (column + 0.5) / grid;
          positions[o + 1] = (row + 0.5) / grid;
          positions[o + 2] = 0;
          positions[o + 3] = random() * 10000;
          velocities[o] = (random() - 0.5) * 0.015;
          velocities[o + 1] = (random() - 0.5) * 0.015;
          velocities[o + 2] = 1;
          velocities[o + 3] = positions[o + 3] ?? 0;
        }
        next.uploadSeed({
          positions,
          velocities
        });
        return next;
      }
      function createFlow(): FluidField2D {
        const width = Math.max(64, Math.min(512, Math.round(renderer.viewport.width / particleFluidNumber(config, 'fieldCellSize')))), resolved = launch.profile === 'preview' ? Math.min(128, width) : width, height = Math.max(48, Math.round(resolved / viewportAspect()));
        return renderer.createFluidField(`${PARTICLE_FLUID_PLUGIN_ID}.flow`, resolved, height);
      }
      function resetSimulation() {
        particles.dispose();
        flow.dispose();
        randomState = (launch.seed ?? 260706) >>> 0;
        particles = createParticles();
        flow = createFlow();
        observedGeneration = particles.generation;
        resetCpuState();
      }
      function resetCpuState() {
        splats.length = 0;
        previous.clear();
        pendingDt = 0;
        elapsed = 0;
        pointerActive = false;
      }
      function applyStyle() {
        const style = requireStyle(), background = particleFluidColor3(style.background), enhanced = particleFluidString(config, 'renderStyle') === 'enhanced', visual = visualProfile(styleId);
        renderer.setClearColor([
          background[0],
          background[1],
          background[2],
          1
        ]);
        renderer.setBackdrop(undefined);
        renderer.setBloom({
          enabled: enhanced,
          intensity: enhanced ? particleFluidNumber(config, 'bloomStrength') * visual.bloom : 0,
          threshold: 0.42,
          radius: Math.min(4, 2.2 + visual.bloom),
          iterations: 2,
          resolutionScale: 0.5
        });
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
      function random() {
        randomState ^= randomState << 13;
        randomState ^= randomState >>> 17;
        randomState ^= randomState << 5;
        return (randomState >>> 0) / 4294967296;
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
function visualProfile(id: string) {
  if (id === 'phosphor-stream')
    return {
      pointScale: 1.35,
      bloom: 1.25
    };
  if (id === 'ember-wake')
    return {
      pointScale: 1.18,
      bloom: 1.55
    };
  if (id === 'ultraviolet-rift')
    return {
      pointScale: 1.45,
      bloom: 1.7
    };
  if (id === 'arctic-spark')
    return {
      pointScale: 0.82,
      bloom: 1.15
    };
  if (id === 'laser-red')
    return {
      pointScale: 0.72,
      bloom: 1.8
    };
  if (id === 'blueprint-ink')
    return {
      pointScale: 0.9,
      bloom: 0.72
    };
  if (id === 'solar-flare')
    return {
      pointScale: 1.3,
      bloom: 1.65
    };
  if (id === 'deep-sea-ion')
    return {
      pointScale: 1.05,
      bloom: 1.35
    };
  if (id === 'magenta-current')
    return {
      pointScale: 1.15,
      bloom: 1.45
    };
  return {
    pointScale: 1,
    bloom: 1
  };
}
