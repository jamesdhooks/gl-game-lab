# Advanced Unified GPU Particle Engine Re-Audit — 2026-07-17

## Executive verdict

The WebGL2 particle architecture is now a genuine executable engine subsystem rather than a shared type facade. Typed graphs compile into reflected GLSL/WGSL programs; a common runtime owns emission, scheduling, parameters, palettes, capacity, events, rendering, diagnostics, replay, hot replacement, resource reuse, and adaptive render LOD. Sparks, Fireworks, and Orbital Shrapnel run through it.

This is production-credible for the current WebGL2 scenes. The entire hardening plan is **not complete**. Three material claims would still be false:

1. WebGPU is not an automatically selectable production renderer. It is a tested compute/runtime prototype with an external render callback, and it deliberately rejects circle/capsule graphs that it cannot execute faithfully.
2. Event admissions and losses are estimates. There is no fenced asynchronous compact-counter readback, so diagnostics are not exact or delayed GPU truth.
3. Specialized GPU solvers do not yet submit external GPU-resident state through a shared particle appearance/render adapter.

The legacy Sparks/Fireworks implementations should remain as rollback paths until James accepts live visual parity. Deleting them now would trade a manageable duplication cost for unnecessary recovery risk.

## Delivery matrix

| Plan area | Result | Evidence and limitation |
|---|---|---|
| Serializable effect graph | Pass | Typed archetypes, emitters, graph composition, parameters, persisted bindings, capacity shares, events, render recipes, preview limits, and quality overrides are validated. |
| Executable compiler | Pass | Deterministic graph/ABI hashes, generated GLSL and WGSL, reflection, render-pass tables, capability requirements, extension validation, and deterministic artifacts exist. |
| Pre-validation artifacts | Pass with caveat | Simulation typecheck/build runs the source compiler first and emits ignored full program JSON, manifests, and shaders keyed by compiler, ABI, graph, precision, backend, and tier. Scene modules still retain an in-process compile fallback instead of importing generated modules. |
| Shared runtime | Pass | `EngineParticleEffects2D` owns programs, instances, pools, prewarm, parameters, palettes, viewports, colliders, force fields, domains, event tuning, render tiers, reset, disposal, inspection, and replacement. |
| Zero-allocation emission API | Pass | Reusable handles/writers and fixed command buffers are used. Benchmarks report zero allocations after warmup. Convenience object emission remains for setup/tests. |
| WebGL2 direct emission | Pass | Up to 64 sorted commands use six-step lower-bound lookup. Spawn budgets are clamped to capacity and partition/overflow policies are compiled. Command count does not multiply full simulation passes. |
| Deterministic WebGL2 events | Pass with diagnostic caveat | Priority-encoded claim and resolve passes replace hashed child probing. Event windows suppress idle passes. Actual GPU contention/admission counters are not read back. |
| Render recipes | Pass | Basic points; Enhanced points/streaks; Ultra trail feedback, layered glow/bloom and terminal treatment execute through the shared backend. |
| Adaptive LOD | Pass | Sustained frame pressure thins rendering and lowers effective render tier without altering simulation state, then recovers conservatively. |
| Coordinates and DPR | Pass | One logical viewport contract drives simulation, dynamic colliders/domains, and rendering. Orbital aspect-ratio collision alignment is covered by the compiled path. |
| Context restoration | Pass for WebGL2 | Restorable resources rebuild state, command/event targets, pipelines and trail resources. ABI-compatible hot replacement attempts GPU-to-GPU state transfer; incompatible changes reset deterministically. |
| WebGPU prototype | Partial | Storage buffers, compute simulation, event append/resolve semantics, direct emission, curves, palettes, points/streaks, domains, force fields, and fallback tests exist. No complete WebGPU canvas/renderer integration, hardware validation, or collider parity exists. |
| Diagnostics | Partial | Capacity, activity estimates, commands, uploads, passes, allocations, timings, caches, rebuilds, fallbacks and estimated event flow are visible. Exact compact asynchronous event counters are absent. |
| Inspector | Pass | The development debug panel shows graphs, ABI/hash, resources, shaders, parameters, archetypes, events, LOD, and supports pause, step, reset and reseed. Hot-reload explanations are retained. |
| Capture/replay | Pass | Seeds, parameters, palette changes, direct commands and pointer provenance can be captured and replayed deterministically. |
| Sparks migration | Pass pending human parity | Core/primary/bounce archetypes, weld/pinwheel/shower emission, rails, collisions, bounce events, settings and tiers use the compiled runtime. Legacy path remains for rollback. |
| Fireworks migration | Pass pending human parity | Shell/primary/secondary/sparkle, eight patterns, launch targeting, inherited event chains, palettes and terminal effects use the compiled runtime. |
| Orbital migration | Pass pending human parity | Annulus initialization, tangent orbital velocity, radial gravity, planet kill collision, circular wrap domain, textures and tiers use the compiled runtime. |
| Specialized solver adapter | Fail | Splash PIC/FLIP and Water Tank correctly remain specialized, but there is no shared external-state appearance/render adapter yet. |
| Benchmark lab | Pass with scope caveat | The lab persists real reports and the runner supports the full matrix. Twelve required desktop gate workloads were executed across all three migrated effects. The 36-workload all-tier matrix and mobile gate were not executed. |
| Visual captures | Pass with quality caveat | Three Sparks tiers, eight Fireworks patterns and Orbital Ultra have fixed-seed captures. The late Fireworks anchor makes some pattern differences subtler than an ideal golden suite. |

## Architecture review

### Strong decisions

- The graph is data, not scene code. Persisted bindings, parameters, event depth, capacity, modules and render recipes have one validation boundary.
- The compiled program is backend-neutral at the semantic layer but backend-specific at execution. Reflection and capability requirements make unsupported paths explicit.
- The state ABI is compact and sufficient: position/age/lifetime, velocity/rotation, and archetype/generation/color/flags.
- Scenes retain the correct responsibility boundary: low-count pointer interpretation, shell targeting, and authored colliders. Dense state, children and rendering stay GPU-resident.
- The WebGL2 event allocator is deterministic and bounded. Priority is explicit rather than an accidental shader-order side effect.
- Runtime resource pooling, prewarming and ABI-aware replacement are coherent and testable.
- Keeping PIC/FLIP and other solvers outside the generic motion model is correct. A generic particle engine should not swallow specialized numerical solvers.

### Rushed or temporary decisions

- `ParticleEffectCompiler2D.ts` is still a large string-generating compiler. Formatting is now readable enough to pass hygiene, but shader IR, source mapping and error locations are immature.
- Build-time artifacts are validation/cache products, not yet the sole runtime import. Compilation still occurs when scene effect modules are evaluated.
- WebGPU rendering is injected through a callback rather than owned by a renderer package that can present a frame. This is a prototype boundary, not a shipping backend.
- Diagnostic event numbers derive from CPU-visible demand and static graph structure. Calling them admissions or losses without the `estimated` label would be misleading.
- The benchmark workload reaches full capacity quickly. It is useful as a throughput gate but does not represent every real scene's active-particle distribution.
- Visual acceptance captures are evidence, not pixel-golden tests. They currently prove populated/error-free paths better than precise pattern appearance.

## Code quality

Readability and modularity improved substantially. Scene plugins no longer contain the primary simulation shader or capacity/command machinery. Compiler, graph, runtime, scheduler, partitions, reference evaluator and backend resources have distinct responsibilities.

The main maintainability risk is shader generation. Long embedded source blocks combine code generation and shader implementation, so refactors still require careful CPU-reference, string-structure and GPU-construction tests. A small typed shader IR or module template library would reduce this risk without requiring a general-purpose shader language.

Naming is consistent around graph/effect/program/runtime/instance/emitter. The remaining `legacyDefinition` adapter is deliberately named and useful for compatibility, but it should not become the preferred authoring API.

The hot-reload API is honest: it reports registered, preserved, or reset and explains why. It does not claim state preservation merely because the ABI hash matched; backend transfer must also succeed.

## Performance review

The largest prior costs are fixed:

- Multiple direct commands no longer cause multiple full-state simulation passes.
- Spawn lookup is logarithmic over the bounded 64-command table.
- Idle event passes are suppressed by conservative windows.
- Parameter and palette uploads are dirty-tracked.
- Dense state and rendering remain GPU-resident without production full-state readback.
- Adaptive render LOD can reduce fill/feedback cost without changing simulation results.

Observed desktop release-gate measurements are in `docs/benchmarks/particle/2026-07-17-matrix-gates.json`. Across Sparks, Fireworks and Orbital:

- 65k Ultra: 59.55–59.93 average FPS, GPU p95 3.16–4.09 ms.
- 147k Ultra: 59.70–59.95 average FPS, GPU p95 2.81–3.35 ms.
- 262k Enhanced: 59.22–59.95 average FPS, GPU p95 0.44–0.57 ms.
- 590k Basic: 58.97–59.69 average FPS, GPU p95 0.61–0.75 ms.

The GPU budgets pass comfortably. A literal 60.00 average-FPS rule fails for the 65k/147k samples because browser scheduling reports 59.x. That should be treated as a strict-gate failure until the policy explicitly allows refresh-rate tolerance; it must not be rounded into a pass after the fact.

The largest remaining performance uncertainties are event-allocator contention under extreme recursive finales, real mobile fill-rate, WebGPU hardware behavior, and external specialized-solver rendering. The 36-workload full matrix runner exists but was not executed in this audit.

## Correctness and robustness

- CPU reference evaluators cover motion, domains, distributions, curves, collisions and event arbitration.
- Debug-only state snapshots exist for tests/benchmark inspection. Production scene execution does not call them.
- Runtime parameters are validated, clamped and dirty-tracked. Persisted aliases resolve visibly; unknown keys are reported instead of silently dropped.
- Event depth and graph recursion are validated before execution.
- Context loss and resource recreation have package tests.
- No cross-driver bitwise determinism is promised; floating-point accumulation order remains backend/driver dependent.

Remaining correctness gaps:

- WGSL is string-tested against mocked device interfaces; it is not validated on WebGPU hardware in this environment.
- The WebGPU backend does not implement circle/capsule collisions and therefore falls back rather than approximating.
- Exact GPU event losses are unavailable.
- Scene visual parity still needs James's live acceptance before legacy deletion.

## Comparison with professional engines

Approaching production quality:

- Data-authored effect graphs and explicit compiled artifacts resemble Bevy asset pipelines and modern Unity VFX authoring boundaries.
- Backend-neutral semantics with backend-specific execution and fallback are conceptually aligned with bgfx/Filament architecture.
- Deterministic capacity partitions, explicit overflow and GPU-resident event children are stronger than many browser particle libraries.
- Prewarm, pooling, reflection, inspector controls, replay and ABI-aware hot reload are real engine features rather than demo conveniences.

Still prototype quality compared with Unity, Unreal, Godot or Wicked Engine:

- No visual node graph or mature authored asset pipeline.
- No complete WebGPU renderer/device lifecycle.
- No shader-source mapping, offline native shader validation, or vendor/device certification matrix.
- No exact asynchronous GPU counters for event flow.
- No shared rendering bridge for external solver buffers.
- No 3D particles, mesh particles, lighting integration, sorting or GPU culling; those were intentionally deferred.

## Grades

| Area | Grade | Rationale |
|---|---:|---|
| Architecture | A- | Correct graph/compiler/runtime/backend split and three scene proofs; external solver and complete WebGPU renderer remain open. |
| API design | A- | Typed graphs, reusable emitters, parameters, replay and honest hot reload are strong; build artifacts are not yet the sole runtime source. |
| Maintainability | B+ | Scenes are thin and boundaries are cohesive; string-generated shader compiler is still costly to change. |
| Performance | A- | GPU residency, bounded passes, event windows and measured desktop scaling are strong; mobile and recursive-event truth remain unmeasured. |
| Scalability | A- | 590k Basic remains near refresh rate on the reference desktop; exact contention and mobile fill gates are missing. |
| Rendering | A- | Executable tiers, streaks, trails, glow, bloom, palettes and LOD are shared; WebGPU presentation and external-state rendering are missing. |
| Diagnostics | B | Inspector and broad counters are useful, but event flow is estimated rather than exact/delayed GPU truth. |
| Extensibility | A- | Registered modules, typed parameters and CPU references provide a sound extension model; authoring UX and shader IR are immature. |
| Production readiness | B+ | Mergeable for WebGL2 current scenes with rollback paths; not ready to claim full multi-backend completion. |

## Merge and rewrite decision

- Merge the WebGL2 runtime/compiler/tooling and the three compiled migrations: **yes**.
- Delete legacy particle scene paths now: **no**, wait for human parity acceptance.
- Rewrite major portions before merge: **no**.
- Treat WebGPU as a shipping automatic backend: **no**.
- Begin another concrete hardening pass: **yes**.

## Next pass

### High priority

1. Build a complete WebGPU renderer/canvas target and device-loss lifecycle, then wire internal capability selection through the fallback backend. Implement collider parity or keep those graphs on WebGL2 explicitly.
2. Add compact counter buffers/textures with fenced asynchronous reads for event attempts, admissions and loss reasons. Preserve zero synchronous production readback.
3. Add the external GPU particle-state render adapter for PIC/FLIP, Water Tank and future specialized solvers, including palettes, curves, points/streaks/trails/glow and diagnostics.
4. Run and commit the mobile preview gate. Test context loss and backend fallback in a WebGPU-capable browser/device.
5. Perform James's live Sparks/Fireworks/Orbital parity review before removing rollback implementations.

### Medium priority

1. Make generated program modules the primary runtime imports; retain runtime compilation only for development hot reload and unbuilt authoring.
2. Add a typed shader-module IR with source locations and native GLSL/WGSL validation in CI.
3. Execute the full 36-workload desktop matrix and add refresh-rate-tolerant FPS policy separately from GPU-time budgets.
4. Improve visual capture timing so every Fireworks golden is taken near maximum pattern readability and Sparks captures occur during active emission.
5. Add stress captures for recursive secondary/terminal events and overflow policies.

### Low priority

1. Add a visual node editor over the existing serializable graph.
2. Add curve-texture authoring previews and parameter animation timelines.
3. Design a separate 3D particle ABI rather than stretching the 2D state layout.

## Final assessment

The original audit's central criticism—"declarative metadata without an executable common runtime"—has been resolved. The current WebGL2 particle system is a serious engine subsystem and a sound base for more scenes. The next pass should be narrower and evidence-driven: complete WebGPU presentation, exact counters, external solver rendering, mobile certification, and human parity acceptance.
