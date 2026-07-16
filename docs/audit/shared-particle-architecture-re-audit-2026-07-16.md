# Shared GPU Particle Architecture Re-Audit — 2026-07-16

## Verdict

The migration solves the immediate duplication and pass-amplification problems for Sparks and Fireworks, and it establishes a real common GPU ABI. It does **not** yet constitute a general particle-effect compiler or a complete professional particle authoring system.

Sparks and Fireworks now share:

- State A: position, age, lifetime.
- State B: velocity, rotation, angular velocity.
- State C: archetype, generation, color seed, event flags.
- A fixed 16-float, 64-command upload ABI.
- One direct simulation pass per frame regardless of direct command count.
- Validated effect/archetype/module/render-recipe definitions.
- Basic, Enhanced, and Ultra rendering concepts.
- GPU-resident dense particle motion and rendering with no per-frame particle readback.

The implementation is suitable to merge for these two scenes. A second architecture pass should happen before several more effects are added, because module definitions currently describe and validate behavior but do not generate or compose the GLSL implementation.

## Delivery Matrix

| Requirement | Result | Evidence / limitation |
|---|---|---|
| Versioned state ABI | Pass | `PARTICLE_EFFECT_STATE_ABI_VERSION` and three documented four-channel states; both scenes use metadata State C. |
| Batched direct commands | Pass | One command-texture upload and one simulation pass; commands no longer cause N full-capacity passes. |
| Maximum 64 commands | Pass | Fixed reusable command buffer, deterministic packing, overflow accounting tests. |
| GPU sub-emitters | Pass with limits | Fireworks age/death children run in one bounded event pass. Sparks collision children use explicit State-C flags in the normal pass. Event target contention is not yet diagnosed. |
| No production particle readback | Pass | Simulation and rendering remain texture-resident. The renderer's one-pixel readback is only a one-time float-blend capability probe, not particle-state readback. |
| Sparks visual/behavior parity | Pass directionally | Existing shaders and settings were retained; live Welding/rails/Ultra checks passed after State-C migration. This was not a pixel-perfect comparison. |
| Fireworks launch power | Pass | Launch power scales the target-solved velocity and has a focused behavioral test. |
| Fireworks patterns | Pass | Peony, ring, chrysanthemum, willow, palm, spiral, crossette, and comet have distinct GPU spawn equations. |
| Fireworks secondary/crackle | Pass | Secondary and terminal sparkle particles are real GPU children; crackle controls terminal flicker rather than faking children. |
| Palette transitions | Pass | Per-shell, radial, over-life, and generation/accent modes use the active scene palette. |
| Contextual settings | Pass | Fireworks does not expose or compile collision/rail parameters; render-tier visibility is declared on tier-specific controls. |
| Saved settings preservation | Pass | All legacy keys remain accepted and tested. New keys receive defaults. |
| Preview cycle | Pass with limitation | Fireworks resets in place and randomizes style/pattern. The runtime does not receive lock metadata, so scene-local pattern randomization cannot independently inspect authored locks. |
| Context loss | Pass at resource layer | Existing restorable GPU resources rebuild State A/B/C, command textures, and event programs. No destructive particle readback is required. |
| Compatibility backend | Partial | The low-level two-target backend remains available, but Fireworks requires State C. WebGL2's required draw-buffer minimum normally satisfies it; there is no reduced-feature Fireworks fallback for a nonconforming implementation. |
| Zero allocations after warmup | Partial | GPU command storage and uploads are reused. Scene orchestration still creates low-count command/shell objects and uses array splices; Sparks also rebuilds rail/palette arrays during rendering. |
| Capacity benchmarks | Incomplete | Live 147k-state Fireworks ran at 60 FPS with roughly 2 ms reported GPU time on the current desktop. Automated 65k/147k/262k/590k benchmark artifacts were not produced. |

## Architecture Assessment

### What is strong

The state ABI and command ABI are small, explicit, versioned, and backend-portable. The command texture is a good WebGL2 substitute for a storage/append buffer and maps cleanly to a future WebGPU backend. The direct-command priority is deterministic because contiguous ring ranges are assigned on the CPU before one GPU pass.

State C removes the worst prior hack: Sparks no longer encodes collision-event direction in the fractional component of particle kind. Fireworks can now carry archetype, generation, palette seed, and event flags independently of motion.

Fireworks' event pass is genuinely GPU-resident. Parent position and velocity are read directly from state textures, child generation is bounded, and no CPU event reconstruction or readback is involved.

The renderer-level diagnostics expose command uploads, simulation/event/render pass counts, context generation, and rebuilds. This made the live migration failure and subsequent pass behavior observable.

### What remains temporary

`ParticleEffectDefinition2D.modules` and archetype profiles are declarative metadata, not executable composition. Both scenes still own monolithic simulation and rendering shaders. Gravity, drag, lifetime, palette lookup, and age curves are therefore conceptually shared but partly duplicated in GLSL. This is the largest architectural gap.

`ParticleEffectController2D` is a contract without a concrete shared controller used by both scenes. Capacity rebuilds, scene command staging, render sequencing, and some diagnostics aggregation remain scene-owned. The scenes are thinner than before, but not yet thin orchestration-only layers.

Render recipes are validated but manually interpreted. A common recipe executor should own point/streak/trail/bloom sequencing and only ask scenes for uniforms or optional custom passes.

Event diagnostics are incomplete. The backend counts event passes, not birth/age/death/collision events, attempted children, occupied-target drops, or drops by priority. High-density finales can silently lose child events when target slots are occupied.

The Fireworks event shader executes a full-capacity event pass every frame, even when no particle can emit. This is bounded and predictable, but expensive at 590k capacity. A GPU event-activity reduction would itself require synchronization/readback; a practical WebGL2 compromise is CPU-side scheduling of pass windows based on known direct bursts, with conservative tails.

## Performance Assessment

Direct emission pass amplification is fixed. Before migration, 12 Fireworks commands or 16 Sparks commands could mean 12 or 16 full state passes. Direct commands now remain one simulation pass.

The largest remaining costs are:

1. Full-capacity Fireworks event pass every frame.
2. Ultra trail feedback plus repeated full-capacity point/streak render passes.
3. Fragment loops over up to 64 direct commands for every particle texel during a spawn frame.
4. Sparks' bounded collision-child probe and up to 13 capsule tests per active particle.
5. Low-count JavaScript command objects, array splices, and Sparks rail/palette typed-array creation.

The command loop is acceptable at ordinary emission rates but scales as particle capacity times command count on spawn frames. A command-to-slot lookup texture or slot-owner texture would trade another compact upload for constant-time command resolution if profiling shows this loop dominates.

## Correctness and Robustness

Known risks:

- Event children only claim inactive slots. Collisions between child target mappings are resolved by shader order and are not reported.
- Fireworks target solving is exact at the legacy 940 launch-power baseline. Other launch-power values intentionally under/overshoot while retaining the independent fuse; this is visible and controllable, but the UI description should not imply every power still hits the pointer.
- Context capability validation checks State-C draw-buffer support before construction, but Fireworks has no reduced-feature fallback.
- Parallel float execution is deterministic for the same GPU/driver path but not bit-for-bit portable across all drivers.
- Shader strings remain difficult to refactor safely because there is no reflection-generated uniform contract.

## Grades

| Area | Grade | Reason |
|---|---:|---|
| Architecture | B | Strong ABI and batching; no executable module compiler or shared controller yet. |
| Maintainability | B- | Clear effect definitions, but large scene-owned GLSL remains. |
| Performance | B+ | Pass amplification removed and state stays GPU-resident; unconditional event pass remains. |
| Scalability | B | Dense state scales well; 590k event and multi-render costs need measured gates. |
| Rendering | A- | Distinct tiers, streaks, trails, bloom, palette transitions, and real terminal particles. |
| API design | B | Useful backend-neutral contracts; controller contract is not yet the actual runtime path. |
| Code quality | B | Strict typed implementation and tests; shader composition and scene arrays are the weak points. |
| Production readiness | B- | Good for current scenes and desktop WebGL2; needs benchmark matrix, event diagnostics, and fallback policy before broad engine adoption. |

## Required Next Pass

### High priority before a third complex particle scene

1. Implement a concrete shared `ParticleEffectController2D` that owns command staging, capacity/rebuild state, palette state, diagnostics aggregation, and recipe execution.
2. Replace duplicated motion/lifecycle/appearance GLSL with shared shader chunks or a validated shader-assembly system. Keep scene-authored pattern/collision functions as explicit extension points.
3. Add event counters and dropped-child/occupied-target diagnostics by trigger and priority.
4. Produce repeatable 65k, 147k, 262k, and 590k browser benchmarks for Basic, Enhanced, and Ultra, including event-heavy finales.

### Medium priority

1. Remove render-loop typed-array creation in Sparks and replace command-array splicing with reusable ring storage.
2. Add a reduced-feature two-target Fireworks fallback or explicitly fail capability selection before the scene opens and use a static preview.
3. Add debug-only small-capacity GPU readback tests for motion, collision, inheritance, and event depth. Keep readback absent from production.
4. Add generated/reflected uniform validation so missing or renamed shader inputs fail during construction.

### Low priority

1. Add curve textures for authored size/alpha/intensity/color curves.
2. Add a WebGPU append-buffer backend while retaining the same engine-facing definitions.
3. Add visual golden captures for the eight Fireworks patterns and Sparks parity checkpoints.

## Merge Decision

Merge for the current Sparks and Fireworks scope: **yes**. Treat the shared definition API as provisional for third-party authoring: **yes**. Claim that the complete reusable particle-engine abstraction is finished: **no**.
