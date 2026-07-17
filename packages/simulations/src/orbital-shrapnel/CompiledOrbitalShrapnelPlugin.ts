import {
  createExtensionToken,
  type EnginePlugin,
  type PointerInputEvent,
} from "@hooksjam/gl-game-lab-core";
import {
  EngineGpu2D,
  EngineInput,
  EngineParticleEffects,
  EngineRender2D,
  EngineSchedule,
  InteractionRadiusIndicator2D,
  type ExperienceLaunchOptions,
  type ExperienceRuntimeController,
  type ExperienceSettingValue,
  type ParticleAttractor2D,
  type ParticleEffectInstance2D,
  type Texture2DHandle,
} from "@hooksjam/gl-game-lab-engine";
import { registerSimulationRuntime } from "../SimulationPluginLifecycle.js";
import {
  createOrbitalShrapnelConfig,
  ORBITAL_SHRAPNEL_DEFAULTS,
  orbitalBoolean,
  orbitalNumber,
  type OrbitalShrapnelConfig,
} from "./config.js";
import {
  ORBITAL_OVERLAY_SHADER,
  ORBITAL_REALISTIC_OVERLAY_SHADER,
} from "./shaders.js";
import {
  asteroidLaunchVelocity,
  debrisSpawnCount,
  orbitalGravityWorld,
} from "./orbitalMotion.js";
import { orbitalColor3, ORBITAL_SHRAPNEL_STYLE_MANIFEST } from "./styles.js";
import { ORBITAL_SHRAPNEL_PARTICLE_PROGRAM } from "./effect.js";

export type CompiledOrbitalShrapnelMode =
  | "add"
  | "interact"
  | "well"
  | "asteroid";
export interface CompiledOrbitalShrapnelController
  extends ExperienceRuntimeController {
  readonly mode: CompiledOrbitalShrapnelMode;
  readonly particleCapacity: number;
}
export const CompiledOrbitalShrapnelControllerService =
  createExtensionToken<CompiledOrbitalShrapnelController>(
    "gl-game-lab.simulations.orbital-shrapnel.compiled.controller",
  );
export const COMPILED_ORBITAL_SHRAPNEL_PLUGIN_ID =
  "gl-game-lab.simulations.orbital-shrapnel.compiled";
const EARTH_TEXTURE_URL = new URL(
    "./assets/earth-natural-1024.jpg",
    import.meta.url,
  ).href,
  MOON_TEXTURE_URL = new URL("./assets/moon-natural-512.jpg", import.meta.url)
    .href;
interface MutableField {
  x: number;
  y: number;
  strength: number;
  softening: number;
  falloff: "constant" | "inverse-square";
  tangentialStrength: number;
  radialStrength: number;
  radius: number;
  envelope: "none" | "linear";
  velocity: [number, number];
  velocityCoupling: number;
}
interface AddEmitter {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  vx: number;
  vy: number;
  elapsed: number;
}

export function createCompiledOrbitalShrapnelPlugin(
  initial: OrbitalShrapnelConfig = ORBITAL_SHRAPNEL_DEFAULTS,
  launch: ExperienceLaunchOptions = {},
): EnginePlugin {
  let config = initial,
    mode = validMode(launch.modeId) ?? "add",
    styleId =
      validStyle(launch.styleId) ??
      ORBITAL_SHRAPNEL_STYLE_MANIFEST.defaultStyleId,
    elapsed = 0,
    randomState = seedValue(launch.seed),
    activePointerId: number | undefined,
    asteroidStart: { x: number; y: number } | undefined,
    addEmitter: AddEmitter | undefined,
    forceRevision = 0,
    configuredWidth = 0,
    configuredHeight = 0,
    capacity = capacityFor(config, launch.profile),
    seeded = false;
  const previousPointers = new Map<number, { x: number; y: number }>(),
    indicator = new InteractionRadiusIndicator2D(
      "orbital-shrapnel.compiled.interaction-radius",
    );
  const fields: MutableField[] = Array.from({ length: 10 }, () => ({
    x: 0,
    y: 0,
    strength: 0,
    softening: 1,
    falloff: "constant",
    tangentialStrength: 0,
    radialStrength: 0,
    radius: 0,
    envelope: "none",
    velocity: [0, 0],
    velocityCoupling: 0,
  }));
  return {
    id: COMPILED_ORBITAL_SHRAPNEL_PLUGIN_ID,
    version: "1.0.0",
    dependencies: [{ id: "gl-game-lab.runtime" }],
    install: (context) => {
      const renderer = context.get(EngineRender2D),
        gpu = context.get(EngineGpu2D),
        input = context.get(EngineInput),
        effects = context.get(EngineParticleEffects),
        schedule = context.get(EngineSchedule);
      effects.register(ORBITAL_SHRAPNEL_PARTICLE_PROGRAM, { capacity });
      effects.prewarm(ORBITAL_SHRAPNEL_PARTICLE_PROGRAM.effect.source.id);
      let instance = effects.createInstance(
        ORBITAL_SHRAPNEL_PARTICLE_PROGRAM.effect.source.id,
        { seed: seedValue(launch.seed), qualityTier: "ultra" },
      );
      let earthTexture: Texture2DHandle | undefined,
        moonTexture: Texture2DHandle | undefined,
        disposed = false;
      void Promise.all([
        loadImageTexture(renderer, "orbital.compiled.earth", EARTH_TEXTURE_URL),
        loadImageTexture(renderer, "orbital.compiled.moon", MOON_TEXTURE_URL),
      ])
        .then(([earth, moon]) => {
          if (disposed) {
            renderer.destroyTexture(earth);
            renderer.destroyTexture(moon);
            return;
          }
          earthTexture = earth;
          moonTexture = moon;
        })
        .catch(() => undefined);
      applyStyle();
      instance.setViewport({
        width: Math.max(1, renderer.viewport.width),
        height: Math.max(1, renderer.viewport.height),
        dpr: renderer.viewport.pixelRatio ?? 1,
      });
      configure(true);
      const controller: CompiledOrbitalShrapnelController = {
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
          return Object.freeze({ ...config });
        },
        get particleCapacity() {
          return capacity;
        },
        get entityCount() {
          return instance.diagnostics().activeEstimate;
        },
        setMode: (value) => {
          const next = validMode(value);
          if (!next) throw new Error(`Unknown Space Debris mode: ${value}`);
          mode = next;
          releaseAll();
        },
        setStyle: (value) => {
          const next = validStyle(value);
          if (!next) throw new Error(`Unknown Space Debris style: ${value}`);
          styleId = next;
          applyStyle();
        },
        setSetting: (key, value) => {
          const previousCapacity = capacity;
          config = createOrbitalShrapnelConfig({ ...record(), [key]: value });
          capacity = capacityFor(config, launch.profile);
          if (capacity !== previousCapacity) {
            effects.setCapacity(
              ORBITAL_SHRAPNEL_PARTICLE_PROGRAM.effect.source.id,
              capacity,
            );
            instance.restart(seedValue(launch.seed));
            seeded = false;
          }
          configure(false);
          applyRenderParameters();
        },
        reset: () => {
          randomState = seedValue(launch.seed);
          instance.restart(randomState);
          elapsed = 0;
          seeded = false;
          releaseAll();
          configure(true);
        },
      };
      registerSimulationRuntime(
        context,
        CompiledOrbitalShrapnelControllerService,
        controller,
        () => {
          disposed = true;
          instance.dispose();
          if (earthTexture) renderer.destroyTexture(earthTexture);
          if (moonTexture) renderer.destroyTexture(moonTexture);
          previousPointers.clear();
        },
      );
      schedule.addSystem({
        id: "gl-game-lab.simulations.orbital-shrapnel.compiled.update",
        stage: "update",
        run: ({ time }) => {
          const dt = Math.min(0.05, time.deltaSeconds);
          elapsed += dt;
          if (
            renderer.viewport.width !== configuredWidth ||
            renderer.viewport.height !== configuredHeight
          )
            configure(true);
          for (const event of input.snapshot.events)
            if (event.kind === "pointer") routePointer(event);
          const held =
            activePointerId === undefined
              ? undefined
              : input.snapshot.pointers.find(
                  (pointer) =>
                    pointer.id === activePointerId && pointer.buttons !== 0,
                );
          updatePointerField(held, dt);
          updateAddEmitter(held, dt);
          updateForceFields();
          if (
            (launch.profile === "preview" || launch.profile === "demo") &&
            !held &&
            Math.floor((elapsed - dt) * 2) !== Math.floor(elapsed * 2)
          ) {
            const angle = elapsed * 0.9,
              radius = Math.min(configuredWidth, configuredHeight) * 0.34;
            emitDebris(
              configuredWidth * 0.5 + Math.cos(angle) * radius,
              configuredHeight * 0.5 + Math.sin(angle) * radius,
              -Math.sin(angle) * 45,
              Math.cos(angle) * 45,
            );
          }
          effects.update(dt);
        },
      });
      schedule.addSystem({
        id: "gl-game-lab.simulations.orbital-shrapnel.compiled.render",
        stage: "renderExtract",
        run: () => {
          gpu.submit("orbital-shrapnel.compiled-particles", (target) =>
            effects.render(target),
          );
          submitOverlay();
          if (mode === "interact")
            indicator.submit(
              renderer,
              input.snapshot.pointers,
              orbitalNumber(config, "interactionRadius"),
            );
        },
      });

      function configure(reseed: boolean): void {
        const width = Math.max(1, renderer.viewport.width),
          height = Math.max(1, renderer.viewport.height),
          halfHeight = height * 0.5,
          mu =
            orbitalGravityWorld(orbitalNumber(config, "gravity")) *
            halfHeight *
            halfHeight *
            halfHeight,
          outer = Math.min(width, height) * 0.48,
          inner = Math.max(
            orbitalNumber(config, "planetRadius") + 18,
            Math.min(width, height) * 0.09,
          );
        configuredWidth = width;
        configuredHeight = height;
        instance.setViewport({
          width,
          height,
          dpr: renderer.viewport.pixelRatio ?? 1,
        });
        instance.setParameter("gravity-force", mu);
        instance.setParameter("drag", orbitalNumber(config, "drag"));
        instance.setParameter(
          "max-speed",
          orbitalNumber(config, "rawMaxSpeed") * halfHeight,
        );
        instance.setParameter(
          "debris-size",
          orbitalNumber(config, "debrisSize"),
        );
        instance.setParameter(
          "debris-opacity",
          orbitalNumber(config, "debrisOpacity"),
        );
        instance.setEmitterSource("debris-field", {
          innerRadius: inner,
          radius: outer,
        });
        instance.setEmitterSource("debris-add", {
          radius: orbitalNumber(config, "addRadius"),
        });
        instance.setColliders({
          revision: forceRevision + 1,
          circles: [
            {
              x: width * 0.5,
              y: height * 0.5,
              radius: orbitalNumber(config, "planetRadius"),
              mode: "kill",
            },
          ],
        });
        instance.setDomain({
          revision: forceRevision + 1,
          shape: "circle",
          behavior: "wrap",
          center: [width * 0.5, height * 0.5],
          radius: Math.hypot(width, height) * 0.68,
          damping: 0.72,
        });
        if (reseed || !seeded) {
          instance.restart(randomState);
          const count = Math.max(1, Math.floor(capacity * 0.98));
          instance
            .emitter("debris-field")
            .writer()
            .position(width * 0.5, height * 0.5)
            .direction(0)
            .spread(0)
            .power(Math.sqrt(mu / Math.max(1, outer)))
            .seed(nextSeed())
            .count(count)
            .submit();
          seeded = true;
        }
        updateForceFields();
      }
      function updateForceFields(): void {
        const width = configuredWidth,
          height = configuredHeight,
          halfHeight = height * 0.5,
          centerX = width * 0.5,
          centerY = height * 0.5,
          mu =
            orbitalGravityWorld(orbitalNumber(config, "gravity")) *
            halfHeight *
            halfHeight *
            halfHeight,
          planet = orbitalNumber(config, "planetRadius");
        const central = fields[0]!;
        setField(
          central,
          centerX,
          centerY,
          1,
          Math.sqrt(0.075) * halfHeight,
          "inverse-square",
          0,
          0,
          0,
          "none",
          0,
          0,
          0,
        );
        const bodyCount = Math.round(
            orbitalNumber(config, "secondaryBodyCount"),
          ),
          bodyRadius =
            orbitalNumber(config, "secondaryBodyRadius") * halfHeight,
          bodyForce =
            orbitalNumber(config, "secondaryBodyStrength") *
            0.18 *
            halfHeight *
            halfHeight *
            halfHeight;
        for (let index = 0; index < 8; index++) {
          const field = fields[index + 1]!;
          if (index >= bodyCount) {
            setField(
              field,
              0,
              0,
              0,
              1,
              "inverse-square",
              0,
              0,
              0,
              "none",
              0,
              0,
              0,
            );
            continue;
          }
          const orbit = mix(
              planet * 2.2,
              bodyRadius,
              (index + 1) / Math.max(1, bodyCount),
            ),
            phase =
              elapsed *
                orbitalNumber(config, "secondaryBodySpeed") *
                (0.35 + index * 0.11) +
              index * 2.399;
          setField(
            field,
            centerX + Math.cos(phase) * orbit,
            centerY - Math.sin(phase) * orbit,
            0,
            0.035 * halfHeight,
            "inverse-square",
            bodyForce,
            0,
            0,
            "none",
            0,
            0,
            0,
          );
        }
        const pointer = fields[9]!;
        if (
          activePointerId === undefined ||
          (mode !== "interact" && mode !== "well")
        )
          setField(pointer, 0, 0, 0, 1, "constant", 0, 0, 0, "none", 0, 0, 0);
        else {
          const previous = previousPointers.get(activePointerId);
          if (previous) {
            const radius = orbitalNumber(
                config,
                mode === "well" ? "wellRadius" : "interactionRadius",
              ),
              radial =
                orbitalNumber(
                  config,
                  mode === "well" ? "wellStrength" : "interactionStrength",
                ) *
                (mode === "well" ? 1.8 : 0.16) *
                halfHeight,
              setVelocity =
                mode === "interact"
                  ? pointer.velocity
                  : ([0, 0] as [number, number]);
            setField(
              pointer,
              previous.x,
              previous.y,
              0,
              1,
              "constant",
              radial,
              radius,
              0,
              "linear",
              setVelocity[0],
              setVelocity[1],
              mode === "interact" ? 0.018 : 0,
            );
          }
        }
        instance.setForceFields({
          revision: ++forceRevision,
          attractors: fields as readonly ParticleAttractor2D[],
        });
      }
      function routePointer(event: PointerInputEvent): void {
        const point = { x: event.x, y: event.y };
        if (event.phase === "down") {
          if (activePointerId !== undefined && activePointerId !== event.id)
            return;
          activePointerId = event.id;
          previousPointers.set(event.id, point);
          if (mode === "add") {
            addEmitter = {
              x: point.x,
              y: point.y,
              targetX: point.x,
              targetY: point.y,
              vx: 0,
              vy: 0,
              elapsed: 0,
            };
            emitDebris(point.x, point.y, 0, 0);
          }
          if (mode === "asteroid") asteroidStart = point;
        } else if (event.phase === "move") {
          if (event.id !== activePointerId) return;
          if (event.buttons === 0) releasePointer(event.id, point);
        } else if (event.phase === "up" || event.phase === "cancel") {
          if (event.id === activePointerId) releasePointer(event.id, point);
        }
      }
      function updatePointerField(
        held: (typeof input.snapshot.pointers)[number] | undefined,
        dt: number,
      ): void {
        if (!held || activePointerId === undefined) return;
        const previous = previousPointers.get(activePointerId),
          vx = previous ? (held.x - previous.x) / Math.max(0.001, dt) : 0,
          vy = previous ? (held.y - previous.y) / Math.max(0.001, dt) : 0;
        previousPointers.set(activePointerId, { x: held.x, y: held.y });
        const pointer = fields[9]!;
        pointer.velocity[0] = vx;
        pointer.velocity[1] = vy;
      }
      function updateAddEmitter(
        held: (typeof input.snapshot.pointers)[number] | undefined,
        dt: number,
      ): void {
        if (mode !== "add" || !held || !addEmitter) return;
        addEmitter.targetX = held.x;
        addEmitter.targetY = held.y;
        const oldX = addEmitter.x,
          oldY = addEmitter.y,
          follow = 1 - Math.exp(-dt * 16);
        addEmitter.x += (addEmitter.targetX - addEmitter.x) * follow;
        addEmitter.y += (addEmitter.targetY - addEmitter.y) * follow;
        addEmitter.vx = (addEmitter.x - oldX) / Math.max(dt, 1 / 240);
        addEmitter.vy = (addEmitter.y - oldY) / Math.max(dt, 1 / 240);
        addEmitter.elapsed += dt;
        while (addEmitter.elapsed >= 1 / 30) {
          addEmitter.elapsed -= 1 / 30;
          emitDebris(addEmitter.x, addEmitter.y, addEmitter.vx, addEmitter.vy);
        }
      }
      function emitDebris(
        x: number,
        y: number,
        pointerVx: number,
        pointerVy: number,
      ): void {
        const centerX = configuredWidth * 0.5,
          centerY = configuredHeight * 0.5,
          dx = x - centerX,
          dy = y - centerY,
          radius = Math.max(
            orbitalNumber(config, "planetRadius") + 8,
            Math.hypot(dx, dy),
          ),
          halfHeight = configuredHeight * 0.5,
          mu =
            orbitalGravityWorld(orbitalNumber(config, "gravity")) *
            halfHeight *
            halfHeight *
            halfHeight,
          speed = Math.sqrt(mu / radius),
          direction = Math.atan2(dy, dx) - Math.PI * 0.5,
          count = debrisSpawnCount(
            capacity,
            orbitalNumber(config, "addDebrisVolume"),
          ),
          limit = orbitalNumber(config, "addDebrisVelocity") * halfHeight,
          pointerSpeed = Math.hypot(pointerVx, pointerVy),
          scale =
            pointerSpeed > limit && pointerSpeed > 0 ? limit / pointerSpeed : 1,
          jitter = orbitalNumber(config, "addJitter");
        instance
          .emitter("debris-add")
          .writer()
          .position(x, y)
          .direction(direction)
          .spread(0.05 + jitter * 0.16)
          .power(speed)
          .inheritedVelocity(pointerVx * scale * 0.04, pointerVy * scale * 0.04)
          .seed(nextSeed())
          .count(count)
          .submit();
      }
      function releasePointer(
        id: number,
        point: { x: number; y: number },
      ): void {
        if (mode === "asteroid" && asteroidStart) {
          const halfHeight = configuredHeight * 0.5,
            startWorld = toWorld(asteroidStart.x, asteroidStart.y),
            pointWorld = toWorld(point.x, point.y),
            velocity = asteroidLaunchVelocity(
              pointWorld.x,
              pointWorld.y,
              pointWorld.x - startWorld.x,
              pointWorld.y - startWorld.y,
              orbitalGravityWorld(orbitalNumber(config, "gravity")),
              orbitalNumber(config, "planetRadius") / halfHeight,
              orbitalNumber(config, "rawMaxSpeed"),
            );
          instance
            .emitter("asteroid-stream")
            .writer()
            .position(point.x, point.y)
            .direction(Math.atan2(-velocity.vy, velocity.vx))
            .spread(0)
            .power(Math.hypot(velocity.vx, velocity.vy) * halfHeight)
            .seed(nextSeed())
            .count(1)
            .submit();
        }
        previousPointers.delete(id);
        activePointerId = undefined;
        asteroidStart = undefined;
        addEmitter = undefined;
      }
      function releaseAll(): void {
        previousPointers.clear();
        activePointerId = undefined;
        asteroidStart = undefined;
        addEmitter = undefined;
      }
      function applyStyle(): void {
        const style = requireStyle(),
          background = orbitalColor3(style.background);
        renderer.setClearColor([
          background[0],
          background[1],
          background[2],
          1,
        ]);
        renderer.setBackdrop(undefined);
        renderer.setBloom({ enabled: false });
        instance.setPalette({
          revision: ++forceRevision,
          colors: style.palette.slice(0, 8).map(orbitalColor3),
        });
        applyRenderParameters();
      }
      function applyRenderParameters(): void {
        const realistic = styleId === "realistic",
          background = orbitalColor3(requireStyle().background);
        instance.setParameter(
          "streak-strength",
          orbitalNumber(config, "streakStrength"),
        );
        instance.setRenderParameters({
          pointScale: 1,
          intensity:
            orbitalNumber(config, "bloomStrength") * (realistic ? 0.38 : 1),
          trailFade: orbitalNumber(config, "trailFade"),
          trailBloom:
            orbitalNumber(config, "bloomStrength") * (realistic ? 0.24 : 1),
          trailBackground: background,
          directComposite: false,
        });
      }
      function submitOverlay(): void {
        const style = requireStyle(),
          palette = style.palette,
          planetRadius =
            (orbitalNumber(config, "planetRadius") /
              Math.max(1, configuredHeight)) *
            2,
          pointer =
            activePointerId === undefined
              ? { x: 0, y: 0 }
              : toWorld(
                  previousPointers.get(activePointerId)?.x ?? 0,
                  previousPointers.get(activePointerId)?.y ?? 0,
                ),
          realistic =
            styleId === "realistic" && earthTexture && moonTexture
              ? { earth: earthTexture, moon: moonTexture }
              : undefined;
        renderer.submitFullscreenEffect({
          id: "orbital-shrapnel.compiled.overlay",
          language: "glsl-es-300",
          fragmentSource: realistic
            ? ORBITAL_REALISTIC_OVERLAY_SHADER
            : ORBITAL_OVERLAY_SHADER,
          blend: "alpha",
          uniforms: {
            uResolution: {
              type: "2f",
              value: [configuredWidth, configuredHeight],
            },
            uTime: { type: "1f", value: elapsed },
            uPlanetRadius: { type: "1f", value: planetRadius },
            uPlanetA: {
              type: "3f",
              value: orbitalColor3(palette[1] ?? 1982639),
            },
            uPlanetB: {
              type: "3f",
              value: orbitalColor3(palette[2] ?? 2278750),
            },
            uPlanetLight: {
              type: "3f",
              value: orbitalColor3(palette.at(-1) ?? 16777215),
            },
            uStars: {
              type: "1f",
              value: orbitalBoolean(config, "starField") ? 1 : 0,
            },
            uStarOpacity: {
              type: "1f",
              value: orbitalNumber(config, "starFieldOpacity"),
            },
            uBodyCount: {
              type: "1i",
              value: Math.round(orbitalNumber(config, "secondaryBodyCount")),
            },
            uBodyRadius: {
              type: "1f",
              value: orbitalNumber(config, "secondaryBodyRadius"),
            },
            uBodySpeed: {
              type: "1f",
              value: orbitalNumber(config, "secondaryBodySpeed"),
            },
            uPointerActive: {
              type: "1f",
              value: activePointerId !== undefined && mode === "well" ? 1 : 0,
            },
            uPointerMode: {
              type: "1i",
              value: mode === "well" ? 2 : mode === "interact" ? 1 : 0,
            },
            uPointer: { type: "2f", value: [pointer.x, pointer.y] },
            uPointerRadius: {
              type: "1f",
              value:
                (orbitalNumber(
                  config,
                  mode === "well" ? "wellRadius" : "interactionRadius",
                ) /
                  Math.max(1, configuredHeight)) *
                2,
            },
            ...(realistic
              ? {
                  uEarthTexture: {
                    type: "texture" as const,
                    value: realistic.earth,
                  },
                  uMoonTexture: {
                    type: "texture" as const,
                    value: realistic.moon,
                  },
                }
              : {}),
          },
        });
      }
      function toWorld(x: number, y: number): { x: number; y: number } {
        return {
          x:
            ((x / configuredWidth) * 2 - 1) *
            (configuredWidth / configuredHeight),
          y: 1 - (y / configuredHeight) * 2,
        };
      }
      function requireStyle() {
        const style = ORBITAL_SHRAPNEL_STYLE_MANIFEST.styles.find(
          (candidate) => candidate.id === styleId,
        );
        if (!style) throw new Error(`Unknown Space Debris style: ${styleId}`);
        return style;
      }
    },
  };
  function record(): Readonly<Record<string, ExperienceSettingValue>> {
    return Object.freeze({ ...config });
  }
  function nextSeed(): number {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return randomState >>> 0;
  }
}

function setField(
  field: MutableField,
  x: number,
  y: number,
  strength: number,
  softening: number,
  falloff: "constant" | "inverse-square",
  radialStrength: number,
  radius: number,
  tangentialStrength: number,
  envelope: "none" | "linear",
  vx: number,
  vy: number,
  velocityCoupling: number,
): void {
  field.x = x;
  field.y = y;
  field.strength = strength;
  field.softening = softening;
  field.falloff = falloff;
  field.radialStrength = radialStrength;
  field.radius = radius;
  field.tangentialStrength = tangentialStrength;
  field.envelope = envelope;
  field.velocity[0] = vx;
  field.velocity[1] = vy;
  field.velocityCoupling = velocityCoupling;
}
function capacityFor(
  config: OrbitalShrapnelConfig,
  profile: ExperienceLaunchOptions["profile"],
): number {
  const size = Math.round(orbitalNumber(config, "rawParticleTextureSize")),
    bounded = profile === "preview" ? Math.min(128, size) : size;
  return bounded * bounded;
}
function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function validMode(
  value: string | undefined,
): CompiledOrbitalShrapnelMode | undefined {
  return value === "add" ||
    value === "interact" ||
    value === "well" ||
    value === "asteroid"
    ? value
    : undefined;
}
function validStyle(value: string | undefined): string | undefined {
  return value &&
    ORBITAL_SHRAPNEL_STYLE_MANIFEST.styles.some((style) => style.id === value)
    ? value
    : undefined;
}
function seedValue(seed: number | undefined): number {
  const value = seed ?? 771203;
  if (!Number.isSafeInteger(value))
    throw new Error("Space Debris seed must be a safe integer");
  return value >>> 0 || 771203;
}
async function loadImageTexture(
  renderer: import("@hooksjam/gl-game-lab-engine").Render2DService,
  id: string,
  source: string,
): Promise<Texture2DHandle> {
  if (typeof Image === "undefined" || typeof document === "undefined")
    throw new Error("Image textures require a browser");
  const image = new Image();
  image.decoding = "async";
  image.src = source;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Unable to decode orbital texture pixels");
  context.drawImage(image, 0, 0);
  return renderer.createRgbaTexture(
    id,
    canvas.width,
    canvas.height,
    new Uint8Array(
      context.getImageData(0, 0, canvas.width, canvas.height).data,
    ),
  );
}
