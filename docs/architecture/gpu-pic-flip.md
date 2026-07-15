# GPU PIC/FLIP architecture

## Status

This document defines the parity-first GPU backend for Splash PIC/FLIP. The
existing `SplashPicFlipModel` CPU solver remains the production default until
the GPU backend passes every acceptance gate below.

The previous GPU experiment was not a valid port. It replaced the authored
particle-to-grid transfer, pressure response, viscosity, FLIP update, affine
velocity reconstruction, collision handling, and foam evolution with a much
simpler particle shader. Its frame time was promising, but its dynamics were a
different simulation.

## Feasibility

The current solver can run entirely on a WebGL2 GPU because its operations map
to two supported categories:

1. Gather operations, such as pressure gradients, viscosity, grid sampling,
   particle integration, and rendering, map to ordinary texture passes.
2. The particle-to-grid scatter maps to instanced particle splats with additive
   blending into a floating-point grid target.

The required WebGL2 capabilities are:

- `EXT_color_buffer_float` for renderable `RGBA32F` state textures.
- `EXT_float_blend` behavior for additive accumulation into those textures.
- At least three draw buffers for particle-state multiple render targets.
- Vertex texture fetch and instanced drawing, both core WebGL2 facilities.

Capability detection must happen before resource allocation. Unsupported
devices continue on the CPU solver and the UI must not expose an engine/backend
setting.

Floating-point blending can accumulate particles in a different order from the
CPU loop, so bit-identical results are not a realistic contract. Conservation,
bounded error, stability, controls, collision behavior, and rendered character
are the contract.

## Ownership and API boundary

The reusable engine facility is a `GpuParticleGridSystem2D`, not a Splash-only
renderer and not a generic unrestricted compute graph.

- `packages/engine` owns opaque contracts, capability reporting, commands, and
  diagnostics.
- `packages/render-webgl2` owns textures, framebuffers, shaders, draw ordering,
  context restoration, and debug readback.
- `packages/simulations/splash-mpm` owns authored tuning, deterministic seeding,
  input behavior, demo behavior, obstacle creation, and backend selection.
- The existing density-metaball renderer owns the final surface appearance. It
  receives a GPU particle-state source directly; production frames never read
  particle state back to JavaScript.

The system API needs these operations:

- `reset(viewport, tuning)`
- `uploadSeed(seed)`
- `emit(batch)`
- `applyImpulse(segment, radius, force)`
- `setObstacles(revision, obstacles)`
- `step(dt, tuning)`
- `renderSurface(target, appearance)`
- `renderParticles(target, appearance)`
- `metrics()` for counters that do not require readback
- `debugReadback()` only in the parity harness
- `dispose()`

The CPU and GPU implementations consume the same normalized tuning and input
command structures. Backend selection must not fork settings semantics.

## GPU state

### Particle state

Three ping-ponged `RGBA32F` textures store one particle per texel:

| Texture | Components |
| --- | --- |
| Particle A | position x, position y, foam, active flag |
| Particle B | velocity x, velocity y, radius, color seed |
| Particle C | affine 00, affine 01, affine 10, affine 11 |

JavaScript retains only the active count and queued commands. Initial seeding
and new emissions use bounded `texSubImage2D` uploads. There is no per-frame
particle upload or readback.

### Grid state

The grid uses `RGBA32F` targets at the authored simulation resolution:

| Target | Components |
| --- | --- |
| Accumulation | mass, x momentum, y momentum, reserved |
| Normalized/working | mass, x velocity, y velocity, pressure |
| Previous velocity | old x velocity, old y velocity, mass, reserved |
| Scratch | pass-specific ping-pong output |

All simulation textures use nearest filtering. Shader code performs the same
three-by-three quadratic sampling used by the CPU G2P path.

## Frame pass graph

One fixed simulation step executes in this order:

1. **Clear grid accumulation.** Clear mass and momentum to zero.
2. **P2G scatter.** Draw one instanced quad per active particle into the grid.
   The fragment shader evaluates the current radial kernel and APIC affine
   contribution. Additive float blending accumulates mass and momentum.
3. **Normalize and preserve.** Divide momentum by mass and write both the
   working velocity and the old velocity target.
4. **Pressure.** Reproduce the two authored pressure terms from mass,
   `restDensity`, `stiffness`, and `separation`.
5. **Forces.** Apply the central pressure gradient and gravity.
6. **Viscosity.** Apply the authored four-neighbor viscosity blend into the
   scratch grid and swap.
7. **G2P and integrate.** Gather current and previous grid velocity, apply the
   PIC/FLIP blend, integrate position, resolve viewport bounds, reconstruct the
   affine matrix, and update foam.
8. **Obstacle chunks.** Apply all circle/capsule collisions in bounded chunks.
   Additional chunks add passes rather than silently dropping obstacles.
9. **Swap particle state.** The newly written state becomes renderable state.

The P2G quad covers the particle kernel in grid space. Border fragments must
fold virtual out-of-grid samples into the clamped boundary cell to reproduce
the CPU `gridIndex` behavior. Simply clipping the splat at the target boundary
loses mass and is not parity-correct.

## Inputs and lifecycle

- Seed and pour create the same deterministic positions, velocities, radii,
  color seeds, and foam values as the CPU implementation.
- Splash is a queued segment impulse applied in the next G2P pass. It uses the
  same distance-to-segment falloff and rotational component as the CPU model.
- Obstacles are uploaded only when their revision changes. Collision passes
  process every obstacle.
- Resize or a particle/grid-structural setting change performs a controlled
  reset, matching current scene behavior.
- Context restoration recreates resources and reseeds deterministically. It
  must never resume with partially restored state.
- A shader error, unsupported capability, non-finite watchdog result, context
  loss loop, or failed parity gate selects the CPU backend before the next
  visible frame.

## Rendering

The final surface must preserve the established style paths:

- Basic renders the GPU particle texture directly as flat circles.
- Enhanced and Ultra feed the position/radius/foam textures directly into the
  density-metaball accumulation and composition passes.
- Ultra foam/spray is derived from the same GPU foam and velocity state.
- Obstacles and build previews continue through the shared segment and particle
  renderers.

Reading positions back and submitting CPU arrays is explicitly forbidden in
the production GPU path.

## Parity harness

Debug-only readback compares CPU and GPU checkpoints from identical seeds and
commands. It is never enabled in normal play or previews.

### Pass invariants

- Active particle count is identical.
- P2G mass is conserved within `1e-4` relative error.
- P2G momentum is conserved within `1e-3` relative error.
- Empty grid cells remain finite zeroes.
- No particle, grid, pressure, affine, or foam value is NaN or infinite.
- Particles stay within the same viewport and obstacle constraints.

### Trajectory invariants

Compare after 1, 10, 60, and 240 fixed steps:

- Center-of-mass error is below half a grid cell.
- Total momentum error is below 2 percent after accounting for gravity and
  collisions.
- Kinetic energy remains within 5 percent in collision-free scenarios.
- Occupied-grid overlap is at least 95 percent.
- Foam coverage differs by no more than 5 percent.

Scenarios must cover seed settling, pour, splash, wall collision, circles,
capsules, high viscosity, low/high FLIP blend, each resolution, and a capacity
stress case.

## Rollout gates

1. Implement and validate individual GPU passes with debug readback.
2. Run the whole GPU solver behind a development-only opt-in. CPU remains the
   default and the public settings UI does not change.
3. Complete browser comparison on desktop and mobile for all three styles and
   all input modes.
4. Confirm the GPU path improves frame time at 8K, 32K, and 131K particles and
   performs no steady-state CPU readback or full-state upload.
5. Enable GPU by capability only after the parity and performance gates pass.
6. Retain CPU fallback permanently for unsupported or unstable devices.

## Expected performance profile

The GPU path removes the CPU particle-grid loops and per-frame particle buffer
uploads. Its dominant cost becomes P2G overdraw, approximately active particles
times kernel area, followed by grid and metaball passes. The implementation
should specialize common small kernels and use the exact general kernel only
when authored radius/resolution requires it.

This architecture can scale substantially beyond the CPU solver, but the 131K
particle and maximum-support combination still needs adaptive quality or a
WebGPU compute backend. WebGPU can later implement the same engine contract
with compute atomics/binning; it is an additional backend, not a separate scene.
