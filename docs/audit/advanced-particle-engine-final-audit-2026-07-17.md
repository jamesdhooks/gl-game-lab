# Advanced Unified GPU Particle Engine Final Audit — 2026-07-17

## Executive verdict

The particle subsystem is now an executable engine feature, not a collection of scene shaders behind common interfaces. Typed graphs compile into reflected backend programs; a shared runtime owns emission, parameters, capacity, events, render recipes, recovery, diagnostics, replay, inspection, and hot replacement. Sparks, Fireworks, and Orbital Shrapnel prove the general runtime, while Splash PIC/FLIP proves that a specialized GPU solver can reuse shared particle appearance without surrendering its numerical model.

The WebGL2 path is production-credible. The WebGPU path is a real development prototype with compute, GPU-resident presentation, feedback trails, bloom, bounds/circle/capsule collisions, capability selection, and verified device-loss fallback. The normal production host continues to prefer WebGL2 as required by the plan; broader physical-device and vendor certification is still required before changing that policy.

No major rewrite is warranted. The remaining work is acceptance and targeted hardening: physical mobile certification, human visual parity approval, broader WebGPU driver coverage, and an explicit refresh-tolerant FPS policy.

## Closure of the previous audit

| Previous high-priority gap | Result | Evidence and limitation |
|---|---|---|
| Complete WebGPU presentation and device lifecycle | Closed for prototype scope | WebGPU presents points, streaks, Ultra feedback trails, bloom, and composite output from GPU-resident state. Bounds, circles, and capsules share restitution, friction, lifetime-loss, kill/bounce, and event-flag semantics with WebGL2. Device destruction was exercised in a WebGPU-capable in-app browser; its overlay hid and the host reported WebGL2 fallback. |
| Exact/delayed WebGL2 event counters | Closed | Candidate and outcome passes write compact counter targets. A three-slot fence ring reads 16 floats only after signal. Diagnostics distinguish delayed truth from estimated samples and never read full particle state. Detailed counting is inspector-gated. |
| External GPU-state appearance adapter | Closed at infrastructure level | The shared adapter accepts external GPU particle state and reuses particle rendering. Splash PIC/FLIP Basic is the live proof. Other specialized solvers should adopt it only when their state is already GPU-resident and compatible. |
| Mobile and backend-fallback gates | Closed locally, physical-device gate open | The emulated 390x844 DPR-2 mobile matrix completed for all three graph effects. WebGPU device loss and WebGL2 fallback were verified. Physical iOS Safari and Android Chrome remain untested here. |
| Human parity acceptance | Open | Automated contracts and live runtime checks cannot certify James's subjective Sparks, Fireworks, and Orbital visual parity. Rollback paths therefore remain. |

## Delivery against the final hardening plan

| Plan area | Assessment |
|---|---|
| Executable effect graph | Pass. Archetypes, capacity shares, spawn distributions, motion, lifecycle, collision, events, appearance, render recipes, parameters, curves, aliases, preview limits, and quality overrides are compiled and validated. Registered custom modules require typed resources, backend implementations, compatibility declarations, and CPU reference behavior. |
| Build-time compiler | Pass with a maintainability caveat. Deterministic graph/ABI hashes, GLSL/WGSL, reflection, diagnostics, and manifests are emitted and cache-keyed. Runtime compilation remains available for development/hot reload, and the compiler still generates long shader strings rather than a typed shader IR. |
| Shared runtime | Pass. Capacity, command rings, overflow, dirty ranges, palettes, event windows, render recipes, pooling, prewarming, recovery, inspection, replay, and disposal are centralized. |
| WebGL2 execution | Pass. Direct emission uses bounded binary command lookup; spawn budgets cannot overlap capacity; archetype partitions and overflow policies are explicit; event allocation is deterministic and bounded; production execution performs no full-state readback. |
| WebGPU prototype | Pass for the promised prototype scope. Compute simulation, direct emission, event children, bounds/circle/capsule collisions, points, streaks, trails, palette curves, presentation, pipeline caching, and loss handling execute. Production-default selection remains intentionally conservative. |
| Rendering and LOD | Pass. Basic/Enhanced/Ultra recipes, palette curves, streak thresholds, trail/bloom scaling, preview caps, and adaptive presentation thinning execute without changing simulation state. |
| Diagnostics/tooling | Pass. Inspector, replay, hot-reload explanations, upload/pass/allocation/timing/cache/resource data, event outcomes, and development controls exist. GPU timings remain platform-extension dependent. |
| Scene migrations | Pass pending human parity. Sparks, Fireworks, and Orbital use the graph runtime; scene code retains low-count interpretation/planning and authored collider/texture concerns. |
| Specialized solver integration | Pass for the shared boundary. Solvers remain separate; external GPU state can enter the appearance path. Splash is integrated. |
| Automated correctness | Pass for implemented modules. CPU references, compiler validation, runtime/backend tests, settings migration checks, recovery, allocation, and no-production-readback contracts are covered. Cross-vendor and physical-device coverage remains external. |
| Benchmark lab | Pass. Fixed-seed desktop and emulated-mobile matrices persist reports and complete without page errors. The strict desktop aggregate honestly remains failed on literal 60.00 FPS conditions. |

## Architecture and code quality

The strongest decision is the graph/compiler/runtime/backend split. Scenes declare semantics while the compiler makes backend requirements explicit; unsupported functionality falls back instead of silently approximating. The compact state ABI, deterministic command/event allocation, explicit capacity partitions, and render recipes form a coherent 2D engine subsystem.

The architecture also avoids a common abstraction mistake: PIC/FLIP and other field solvers are not forced through a generic particle motion model. Their state can reuse appearance and diagnostics through an adapter while their integration and pressure solves remain specialized.

The primary maintainability weakness is `ParticleEffectCompiler2D.ts`. Shader implementation and source generation are still interleaved in large strings. Tests reduce the risk but do not give mature source mapping, typed intermediate representation, or precise compiler diagnostics. Generated artifacts also are not the only production import path, leaving two compilation modes to maintain.

The WebGPU renderer/session is deliberately narrower than the WebGL2 backend. That is acceptable for a prototype, but backend capability coverage must remain a tested matrix rather than grow through scene-specific exceptions.

## Performance and scalability

The important architectural costs have been removed:

- Command volume no longer multiplies full-capacity simulation passes.
- Spawn ownership is a six-step lookup over the bounded command table.
- Idle event windows skip event work.
- Parameter and palette uploads are dirty-range based.
- Dense particle state, event children, and presentation remain GPU-resident.
- Inspector-only exact event diagnostics do not burden normal play.
- Adaptive LOD reduces presentation cost without altering solver state.

The complete desktop matrix contains 36 workloads across Sparks, Fireworks, Orbital, all three tiers, and 65k/147k/262k/590k capacities. It completed with zero page errors. Across each effect/tier combination, the minimum average FPS and maximum GPU p95 were:

| Workload | Minimum average FPS | Maximum GPU p95 |
|---|---:|---:|
| Sparks Basic | 58.52 | 0.81 ms |
| Sparks Enhanced | 58.47 | 2.71 ms |
| Sparks Ultra | 58.52 | 5.75 ms |
| Fireworks Basic | 58.97 | 0.70 ms |
| Fireworks Enhanced | 49.48 | 3.01 ms |
| Fireworks Ultra | 44.83 | 4.15 ms |
| Orbital Basic | 57.47 | 0.65 ms |
| Orbital Enhanced | 59.44 | 3.18 ms |
| Orbital Ultra | 59.27 | 5.58 ms |

The required GPU-time gates pass. The aggregate report remains `passed: false` because 65k/147k Ultra requires a literal 60.00 average FPS while browser scheduling reports 59.x despite low GPU p95. This audit does not rewrite that evidence after the fact. A later policy change should specify refresh-relative tolerance prospectively.

The emulated mobile preview matrix used 390x844, DPR 2, 65,536 particles, Enhanced tier, and 0.5 render scale. All three effects passed 30 FPS and 33.34 ms GPU p95 with zero page errors: Sparks 59.953 FPS/3.873 ms, Fireworks 59.236 FPS/0.044 ms, and Orbital 59.953 FPS/0.055 ms. Emulation is useful regression evidence, not a substitute for physical mobile GPU/thermal testing.

The clearest un-gated scalability warning is Fireworks at 590k: Enhanced averages 49.48 FPS and Ultra 44.83 FPS. The required 590k Basic gate remains near refresh, but a future requirement for 590k high-fidelity finales would need stronger render culling, compaction, or indirect active-particle drawing.

## Correctness and robustness

- Persisted aliases and bindings sanitize visibly and retain legacy keys.
- Compiler validation rejects cycles, invalid curves/order/resources, unsupported backends, excessive depth, and unsatisfied capacity policies.
- CPU references cover reusable module semantics; debug-only GPU checks cover small-capacity behavior.
- Production paths perform no particle-state readback. Compact WebGL2 diagnostic counters are fenced and asynchronous.
- Context/device loss, rebuild, reset, hot replacement, and disposal have automated coverage. A WebGPU-capable browser device-loss path was exercised live.
- ABI-compatible replacement attempts state preservation; incompatible changes reset deterministically with an explanation.
- Floating-point behavior is tolerance-based; bitwise cross-backend determinism is neither promised nor realistic.

Remaining correctness uncertainty is environmental rather than hidden: physical mobile browsers, additional GPU vendors/drivers, and human visual comparison have not passed in this workspace.

## Professional-engine comparison

Production-oriented ideas:

- Serializable graphs with compiled/reflected artifacts and explicit capability requirements.
- Stable GPU ABI, reusable zero-allocation emission writers, deterministic capacity/event policies, and GPU-resident child events.
- Pipeline prewarm/cache, pooled targets, ABI-aware hot reload, replay, inspector controls, and loss recovery.
- Backend-neutral semantics and honest fallback, comparable in direction to bgfx/Filament resource boundaries and modern Unity/Bevy effect assets.

Still below Unity, Unreal, Godot, Wicked Engine, or mature proprietary engines:

- No visual graph editor, authored asset database/import pipeline, or mature curve timeline.
- No typed shader IR, source mapping, native offline shader validation, or broad vendor certification.
- WebGPU lacks broad physical-driver certification and production-wide automatic selection.
- No 3D, mesh particles, sorting, lighting integration, or GPU visibility/active-list compaction.
- Physical device and long-duration thermal/stability matrices are not automated.

## Grades

| Area | Grade | Rationale |
|---|---:|---|
| Architecture | A | The graph/compiler/runtime/backend split is coherent and proven by three scenes plus an external solver adapter. |
| API design | A- | Typed authoring, emitter handles, contextual bindings, replay, and inspection are strong; generated artifacts are not yet the sole runtime path. |
| Maintainability | B+ | Scene coupling is greatly reduced, but long string-generated shaders remain expensive to evolve. |
| Performance | A- | Required GPU budgets pass and pass amplification/readback are solved; high-tier 590k Fireworks and physical-mobile behavior remain concerns. |
| Scalability | A- | Capacity and LOD architecture is sound through 590k; active-list compaction would be needed for much larger or high-fidelity workloads. |
| Rendering | A | Shared executable tiers, palettes, trails, glow, bloom, LOD, WebGPU presentation, and external-state rendering are substantial. |
| Diagnostics | A- | Delayed GPU event truth, inspector, timings, uploads, replay, and recovery data are strong; timer/counter fidelity remains capability-dependent. |
| Extensibility | A | Registered compiler extensions and backend compatibility declarations provide a disciplined route for new modules and effects. |
| WebGL2 production readiness | A- | Mergeable and production-credible with rollback paths retained until visual acceptance. |
| Multi-backend production readiness | B+ | WebGPU is executable, collider-capable, and recoverable, but physical-device breadth and production-default selection remain unfinished. |

## Merge, rewrite, and deletion decision

- Merge the compiler/runtime/backends/tooling and migrated scenes: **yes**.
- Rewrite major portions first: **no**.
- Remove legacy scene paths now: **no; wait for human parity acceptance**.
- Advertise WebGPU as a universally certified shipping backend: **no**.
- Continue with another broad architecture pass: **no**. Only concrete failed or external gates justify more work.

## Likely top five senior-review criticisms

1. Shader generation remains a large string-based compiler without typed IR, source locations, or native offline validation.
2. WebGPU has only one verified desktop adapter in this audit and is not the normal production default, so the multi-backend claim must remain qualified.
3. Generated build artifacts are not yet the exclusive production runtime source.
4. Physical iOS/Android, broader GPU-vendor, and human parity gates remain external and block deletion of rollback paths.
5. The strict 60 FPS policy is scheduler-naive, while 590k Fireworks Enhanced/Ultra exposes a real high-fidelity scalability limit.

## Concrete next actions

### High priority — release acceptance

1. Run the committed physical iOS Safari and Android Chrome certification workflow, including preview fallback and thermal observation.
2. Have James compare Sparks, Fireworks, and Orbital live against accepted behavior; only then remove legacy rollback implementations.
3. Run WebGPU collider tolerance and loss-recovery certification across additional physical GPU vendors before changing the production backend preference.

### Medium priority — targeted hardening

1. Define a prospective refresh-relative FPS gate while preserving the current failed report unchanged.
2. Add reliable WebGPU hardware benchmark collection before considering broader production selection.
3. Introduce typed shader modules/source mapping and make generated artifacts the primary production imports.
4. If 590k high-fidelity Fireworks becomes a product target, add active-particle compaction, culling, or indirect draw reduction.

### Low priority — future engine scope

1. Add a visual graph/curve authoring layer over the existing serializable graph.
2. Adopt the external-state appearance adapter in additional solvers only when it removes real duplicate GPU presentation code.
3. Design a separate 3D particle ABI rather than expanding the 2D ABI beyond its coherent scope.

## Final assessment

The hardening plan succeeded within its stated local and prototype scope. The WebGL2 subsystem is suitable for production integration; the WebGPU backend is a functioning, collider-capable, loss-recoverable prototype rather than a paper interface; diagnostics and specialized-solver integration are materially complete. The goal should remain open until the explicitly external physical-device and human-parity gates are accepted. Another engineering pass should be driven only by those results or by a decision to make WebGPU the production-default backend.

## Post-audit hardening evidence

After the initial audit was written, the WebGPU compute path gained the same compiled collision profile and dynamic collider contract as WebGL2:

- Per-archetype bounds/circle/capsule flags, restitution, friction, and lifetime loss.
- Sixteen dynamic circle and sixteen dynamic capsule colliders with revision-deduplicated uploads.
- Kill and bounce modes.
- Collision-event flag clearing and setting in State C.
- Runtime-bound collision parameters.
- Complete collider/profile allocation accounting and disposal.

Focused compiler/runtime tests and the complete engine/WebGPU suites pass. On the available NVIDIA WebGPU adapter, the development lab executed Orbital circular-kill and Sparks capsule/event workloads at 65,536 capacity with GPU-resident simulation, zero backend fallback, and no browser warnings or errors. These runs prove shader construction and execution, not a cross-vendor performance result.

The internal WebGPU-to-WebGL2 recovery wrapper was also corrected to replay all semantic configuration before retrying the failed operation. Device loss and uncaptured validation errors invalidate resident WebGPU resources, guaranteeing that the next engine operation enters the recovery wrapper. A focused runtime test forces failure after initialization and proves that palette, colliders, force fields, domain, emitter source, viewport, render parameters, render scale, and validation diagnostics survive the switch. A live forced device destruction then reported `backendFallbackCount: 1`, resumed WebGL2 draw work, retained the Orbital workload, and produced no browser warnings or errors.
