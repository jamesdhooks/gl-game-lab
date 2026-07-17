# GPU Particle Effects Architecture Plan

## Implemented architecture status — 2026-07-17

This document began as the design for the shared particle subsystem. The design is now implemented as a typed graph/compiler/runtime pipeline rather than only the low-level API described below.

- Serializable `ParticleEffectGraph2D` assets compile deterministically to reflected GLSL and WGSL programs, parameter tables, render recipes, capability requirements, graph hashes, and ABI hashes.
- `EngineParticleEffects2D` owns compiled-program caching, reusable emitter writers, fixed command rings, dirty parameter/palette uploads, archetype capacity partitions, pooled render targets, reset/reseed, replay, inspection, hot replacement, and backend recovery.
- WebGL2 is the production backend. Sorted command-prefix ranges use bounded binary lookup, direct command count does not multiply the simulation-pass count, and priority claim/resolve passes allocate event children deterministically.
- WebGL2 event diagnostics use compact 4x1 counter textures and a three-slot fence ring. Only 16 floats are read after a fence signals; full particle state is never read in production. The detailed path is enabled by the development inspector so ordinary gameplay does not pay its extra passes. Counter accuracy is reported as `delayed` when samples are complete and `estimated` if the ring misses a sample.
- The WebGPU prototype owns GPU-resident state, compute simulation, priority event queues, indirect-compatible presentation data, point/streak rendering, persistent feedback trails, bloom/composite presentation, pipeline caching, and device-loss handling. The development benchmark lab selects it internally on supported hardware and automatically retains or restores WebGL2 presentation when WebGPU initialization or device execution fails. Graphs requiring circle/capsule collision parity remain explicitly on WebGL2.
- Basic, Enhanced, and Ultra render recipes are executable and shared. Adaptive render LOD can thin presentation and reduce feedback cost without modifying simulation state.
- An external GPU-state appearance adapter lets specialized solvers reuse shared points, palettes, curves, and diagnostics without replacing their solver. Splash PIC/FLIP is the first live integration; fluid solvers remain numerically independent.
- Sparks, Fireworks, and Orbital Shrapnel are compiled-graph architecture proofs. Their legacy paths remain only as rollback references pending human visual acceptance.
- The development Particle Inspector exposes graphs, archetypes, parameters, resources, event flow, shaders, timings, uploads, pause/step/reset/reseed, replay, and hot-reload results. The benchmark lab records fixed-seed reports for all tiers and required capacities.

Measured reports are committed under `docs/benchmarks/particle/`. The 36-workload desktop matrix and the emulated mobile preview matrix completed without page errors. GPU-time gates pass; the desktop aggregate remains a literal failure because a strict 60.00 FPS condition rejects normal 59.x refresh scheduling. Physical iOS/Android certification and human scene-parity approval are external acceptance gates, not inferred successes.

## Objective

Turn the existing low-level GPU texture-particle support into a reusable particle-effects system that powers both Sparks and Fireworks without forcing either scene to expose irrelevant behavior. Sparks keeps contact emission, rails, collisions, bounce fragments, and welding-specific rendering. Fireworks keeps shell launch, patterned aerial bursts, recursive sub-bursts, and terminal sparkle/crackle events. Both use the same particle state ABI, command path, lifecycle rules, motion modules, palette system, render tiers, trails, diagnostics, and resource lifecycle.

Behavior and visual parity for Sparks is a migration gate. Fireworks may expand after it is running on the shared system.

## Current Audit

The scenes already share `GpuParticleSystem2D`, GPU-resident state textures, ping-pong stepping, point rendering, additive blending, and trail feedback. That is only a backend primitive, not yet a reusable particle engine.

The important gaps are:

- Sparks and Fireworks define incompatible meanings for the same eight state floats. Sparks stores age and lifetime; Fireworks stores remaining lifetime and a seed in the corresponding channels.
- Gravity, drag, spawning, lifetime, palette lookup, particle kinds, and rendering are duplicated in separate monolithic shaders.
- Each queued spawn command triggers another full-capacity simulation pass. Sparks can run up to 16 and Fireworks up to 12 full texture passes in one rendered frame even though only the first advances time.
- Sparks has a substantially richer renderer: Basic/Enhanced/Ultra tiers, point and swept-streak passes, profile-specific size and length, trail continuity, collisions, and GPU-side collision bursts.
- Fireworks has one circular point-sprite renderer plus trail feedback. It has no shared render tiers, swept streaks, size/lifetime curves, palette transitions, or reusable particle profiles.
- Fireworks `launchPower` is passed to the shell spawn command but is ignored by the shell branch of its simulation shader. The visible trajectory is determined by target position, fuse, and gravity.
- Fireworks `crackleIntensity` changes shader flicker brightness; it does not emit crackle particles despite its setting description.
- Fireworks secondary bursts are CPU-timed bursts placed around the parent explosion. They are not reusable particle death/age sub-emitters and do not inherit real parent-particle state.
- Fireworks only implements a randomized radial burst. There is no pattern library or pattern composition.
- Both controllers own similar cursor, command queue, rebuild, context-generation, trail clearing, palette upload, and reset code.
- Sparks configuration is an untyped string-keyed record and its shader encodes collision event state inside the fractional part of `kind`.
- Fireworks tests only cover registration, style count, and config validation. They do not prove that settings change simulation or rendering behavior.

## Layering

### 1. Engine-facing effect API

Add a backend-neutral `ParticleEffect2D` service to the engine package. Content supplies validated effect definitions and spawn commands; it does not provide complete simulation shaders.

Core concepts:

- `ParticleEffectDefinition2D`: particle archetypes, enabled behavior modules, render pipeline, capacity policy, and limits.
- `ParticleArchetype2D`: spawn distribution, motion, lifetime, appearance, optional collision response, and event sub-emitters.
- `ParticleEmitter2D`: point, line, cone, arc, ring, burst-pattern, or custom scheduled source.
- `ParticleSpawnCommand2D`: archetype, count, position, inherited velocity, direction/power, seed, palette seed, and optional overrides.
- `ParticleEventEmitter2D`: `birth`, `age`, `death`, or `collision` trigger with child archetype, probability, count, delay, inheritance, spread, and generation limit.
- `ParticleEffectController2D`: enqueue, clear, resize capacity, set palette, update module parameters, render, and read diagnostics.

The existing `GpuParticleSystem2D` remains the low-level escape hatch and implementation substrate. It should not be removed until both migrations pass.

### 2. Stable GPU state ABI

Use consistent channels for all shared effects:

- State A: `position.xy`, `age`, `lifetime`.
- State B: `velocity.xy`, `rotation`, `angularVelocity`.
- State C: `archetypeId`, `generation`, `colorSeed`, packed flags/event state`.

State C requires an optional third ping-pong render target. Devices that cannot provide the required draw-buffer count retain the existing two-target compatibility backend with reduced features or a CPU fallback. State meaning must be documented and versioned.

Per-particle size, alpha, color, streak length, and intensity should normally be derived from archetype curves plus the stable seed rather than consuming more state.

### 3. Batched GPU command path

Replace one-fullscreen-step-per-command with a compact command texture or uniform-buffer-equivalent upload:

- Collect spawn commands for the frame into a fixed-capacity typed command buffer.
- Upload it once.
- Resolve ring-buffer slot ranges and command ownership in one spawn/update pass.
- Run one normal simulation pass per substep, independent of command count.
- Allow at most one additional event/sub-emitter pass when a configured effect has GPU events.
- Expose dropped-command, dropped-particle, overwritten-live-particle, update-pass, render-pass, and upload-byte diagnostics.

The initial WebGL2 target should support at least 64 commands per frame without allocations after warmup. No production path may read particle state back to the CPU.

### 4. Reusable behavior modules

Implement composable, validated modules over the stable state ABI:

- Motion: gravity, exponential drag, inherited velocity, turbulence/noise, radial/tangential acceleration, rotation, and optional attractors.
- Lifecycle: lifetime and variance, delayed activation, age curves, kill bounds, and sleep/death behavior.
- Spawn distributions: point, disc, line, cone, arc, ring, radial burst, spiral/pinwheel, and downward shower.
- Collision: world bounds plus circle/capsule obstacles, restitution, tangential friction, lifetime loss, and collision events. Entirely disabled when an effect does not request it.
- Events: bounded birth/age/death/collision sub-emitters with probability, child count, generation depth, scale, delay, velocity inheritance, and palette inheritance.
- Appearance: size, alpha, intensity, streak length, and color-over-life curves; seed variation; palette index/gradient selection; flicker and afterglow.
- Rendering: point sprites, swept streaks, trail feedback, bloom/glow compositing, and Basic/Enhanced/Ultra render recipes.

Avoid unrestricted runtime shader graphs in the first version. Compile a known set of module flags into a small number of tested shader variants so shader count, branching, and WebGL2 compatibility remain predictable.

### 5. WebGL2 event strategy

WebGL2 lacks compute append buffers and atomics, so the event API must not promise an implementation it cannot provide.

- CPU-scheduled macro events remain valid for low-count actors such as firework shell launches and timed shell detonation.
- GPU-local collision/death events use deterministic child-slot assignment and a bounded event pass. They never require readback.
- Event overwrite priority is explicit: direct input commands, primary events, secondary events, then cosmetic crackle.
- Counts and generation depth are capped per effect and reported through diagnostics.
- A future WebGPU backend may implement the same API using append/consume buffers without changing scene code.

## Contextual Settings Model

Shared capability does not mean every scene displays every setting.

Each module owns canonical parameter descriptors and validation. A scene exposes selected parameters through a `ParticleSettingBinding` that supplies its label, section, range, visibility, and persisted legacy key.

Examples:

- Canonical `motion.gravity` maps to `gravity` in both scenes.
- Canonical `render.trailPersistence` maps to the existing `trailFade` key so saved settings survive.
- Sparks exposes collision restitution, friction, collision lifetime loss, rail radius, and bounce child profiles.
- Fireworks does not enable the collision module, so collision settings do not exist in its interface or shader variant.
- Fireworks exposes shell, primary burst, secondary burst, and final sparkle archetypes.
- Sparks exposes core, primary, and bounce archetypes.

Add explicit settings migrations and aliases. Existing `scene-defaults.json` and `preview-profiles.json` values must remain valid throughout the migration.

## Fireworks Target Feature Set

Fireworks should gain:

- Basic, Enhanced, and Ultra rendering using the same recipes and terminology as Sparks.
- Shell, primary spark, secondary spark, and terminal sparkle/crackle profiles with contextual size, variability, lifetime, length, speed, intensity, afterglow, and palette controls.
- Burst patterns: peony/radial, ring, chrysanthemum, willow, palm, spiral, crossette/sub-split, and comet. V1 may expose a selected pattern plus a pattern-variation control; demo/preview can choose among enabled patterns.
- Real color-over-life and generation-aware palette transitions: shell color, primary gradient, secondary accent, and terminal white/gold sparkle.
- Configurable secondary event probability, child count, delay, scale, velocity inheritance, spread, and generation depth.
- A separate final-sparkle event with chance, count, power, lifetime, size, and crackle/flicker controls.
- Correct launch behavior. `Launch Power` must measurably change shell motion; targeted fuse-time aiming should either derive from launch power or be presented as a separate targeting mode.
- Stream/finale scheduling that uses the configured rate in play, demo, and preview with preview-safe caps.
- Preview-cycle support through the common preview controller rather than scene remount behavior.

Fireworks should not enable rail collisions, boundary bounce, surface friction, or bounce child events.

## Sparks Migration

Migrate Sparks first because it exercises the hardest reusable features.

1. Freeze current visual and behavioral contracts with config, shader-compilation, collision, bounce-child, setting-effect, and browser smoke tests.
2. Move command batching and state lifecycle to the shared effect controller while retaining the existing Sparks render shaders through an adapter.
3. Replace core/primary/bounce spawn and motion logic with shared archetypes one capability at a time.
4. Replace the fractional `kind` collision marker with explicit event flags in State C.
5. Move point/streak/trail recipes into shared render tiers while preserving current Sparks defaults and outputs.
6. Keep rails as scene-owned obstacle authoring and drawing; publish their circle/capsule collider data to the shared collision module.
7. Remove the old Sparks shader/controller paths only after parity and performance gates pass.

## Fireworks Migration and Expansion

1. Add behavioral tests demonstrating which current settings are inert or misleading.
2. Port shell and primary burst behavior to the shared controller with no visual expansion yet.
3. Adopt shared Basic/Enhanced/Ultra rendering and primary profile controls.
4. Replace CPU-placed pseudo-secondary bursts with bounded age/death sub-emitters that inherit actual parent state.
5. Add the pattern library and generation-aware palette curves.
6. Add terminal sparkle/crackle as a real child particle event.
7. Add common preview-cycle behavior, randomized pattern/palette selection, and preview-safe budgets.
8. Remove the old Fireworks shaders and duplicated queue/reset/render orchestration.

## Performance Gates

- Spawn volume must not increase full-state simulation pass count.
- Normal frames: one update pass per substep. Event frames: no more than one additional event pass.
- Zero particle-state readback and zero full-state CPU upload in production.
- No per-frame JavaScript object or typed-array allocation after warmup for effect stepping, command batching, or uniform preparation.
- One palette upload only when palette data changes.
- Capacity rebuild only when the capacity setting changes.
- Diagnostics must report active estimates, capacity, queued/dropped commands, spawned/dropped particles, sub-emitter events, update passes, render passes, upload bytes, and context generation.
- Benchmark 65k, 147k, 262k, and 590k capacities on the same desktop and mobile browser matrix used by the demo.
- Sparks performance and appearance may not regress from the checkpoint commit that precedes this plan.

## Validation

- Unit tests for state layout, typed config, settings bindings/migrations, command packing, ring allocation, event limits, curves, and deterministic seeds.
- WebGL2 shader compile/link tests for every supported module and render-tier combination.
- Small-capacity GPU trajectory tests using debug-only readback to verify gravity, drag, lifetime, collision, inheritance, and event generations.
- Setting-effect tests proving every exposed slider changes a relevant uniform, command, curve, or rebuilt resource.
- Sparks contract tests for contact emission, pinwheel, shower, rails, collision response, bounce particles, palette sampling, and all render tiers.
- Fireworks contract tests for launch power, fuse, each burst pattern, secondary inheritance/depth, terminal sparkle, palette transitions, stream rate, and all render tiers.
- Browser QA for play, demo, preview authoring, gallery preview cycles, capture, reset, context loss, and settings persistence.
- GPU timing and draw/pass-count assertions around high command rates.

## Delivery Sequence

1. `test(sims): lock particle effect behavior contracts`
2. `feat(engine): define reusable particle effect contracts`
3. `feat(webgl2): batch gpu particle spawn commands`
4. `feat(webgl2): add particle metadata and event passes`
5. `feat(engine): add particle modules and render recipes`
6. `refactor(sims): migrate sparks to shared particle effects`
7. `feat(sims): migrate and expand fireworks particle effects`
8. `test(sims): validate particle parity and performance`
9. `docs(audit): re-audit shared particle architecture`

The final re-audit must compare both scenes against this document, inspect all exposed settings for real effect, confirm the removal of duplicated orchestration and shaders, compare GPU pass counts before and after, and identify whether another consolidation pass is required.
