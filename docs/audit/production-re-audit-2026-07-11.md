# GLGameLab production 2D re-audit — 2026-07-11

## Decision

This release candidate is suitable for an integration/RC branch. It is not yet
ready to replace the production branch. The architecture no longer needs a broad
rewrite, but release approval is blocked by one critical proof gap: forced WebGL
context restoration has not completed successfully in a real browser run. The
supported cross-browser and physical-mobile matrix is also incomplete.

## Evidence reviewed

- Ten workspace packages with enforced dependency boundaries and zero source
  hygiene exceptions.
- 66 test files and 215 directly enumerated `it`/`test` cases, plus production
  Chromium fixed-frame, lifecycle, and accessibility probes.
- All 15 shipped experiences through engine-level render contracts; content has
  zero concrete WebGL renderer imports or WebGL context types.
- Thirty 120-frame desktop/mobile-viewport captures, all within executable CPU,
  draw, upload, transient allocation, and GPU-memory budgets.
- Current branch package typecheck, all TypeScript package builds, boundary check,
  hygiene check, custom source-aliased production Vite build, and direct runtime
  inspector smoke passed. The standard Vite/Vitest wrappers cannot run in this
  sandbox because inherited dependency junctions traverse a denied host path.

## 1. Overall architecture

The package layering is appropriate and substantially better than the original
content-to-renderer coupling. Kernel, authoring facade, platform services,
renderer implementation, physics, hosts, and content have enforceable directions.
Plugin ownership and staged scheduling are coherent. The documented dual-authority
model is the correct choice: ECS for identity-rich scene objects and packed/GPU
domains for homogeneous simulation state.

The elegant parts are generational ECS identity, explicit plugin ownership,
failure-aware scene/assets lifecycle, backend-neutral 2D/GPU contracts, and the
Reference Arena vertical slice. The rushed parts are concentrated in large
orchestrators: `WebGL2Renderer`, `AssetManager`, and several simulation plugins.
They are cohesive enough to operate but expose too many reasons to change in one
file. Hardening Pass 2 added deterministic backend-plugin passes before or after
each of the seven built-in stages. This is a practical extension boundary, though
it remains smaller than a fully resource-declared professional render graph.

## 2. Code quality

Readability and consistency are good. Strict TypeScript, stable IDs, explicit
ownership, and public-root package imports are enforced. Source hygiene reports no
tracked formatting debt, `any`, `@ts-ignore`, `console.log`, TODO, or FIXME usage.

Maintainability is reduced by concentration. `WebGL2Renderer.ts` was 728 lines and
owned facade APIs, managed textures/fonts/fluids, pass orchestration, diagnostics,
restoration, and plugin installation. Hardening Pass 2 extracted its sprite queue
and restorable fluid adapter, reducing it to 645 lines, but managed textures/fonts
and orchestration still share the facade. `DenseCircleParticleWorld2D.ts` is 651 lines;
`AssetManager.ts` is 583. Sparks and orbital-shrapnel plugins exceed 450 lines.
These are not unreadable, but they are clear extraction candidates. The demo's
nested experience selection expression is intentionally temporary and poor as a
long-term gallery registry.

Abstraction boundaries are otherwise strong. Content no longer imports backend
types. `WorldInspector` uses registered schemas instead of private ECS storage.
The main boundary weakness is that low-level GPU concepts remain a growing set of
parallel engine interfaces; without capability grouping or versioning, future
backends may implement an increasingly wide surface.

## 3. Performance

CPU performance is strong for the current content. Desktop p95 peaks around 9 ms
for Ball Pit and 7.8 ms for Water Tank. Mobile-viewport p95 peaks around 11.7 ms.
Broad-phase grids are built once per substep and reused across solver iterations.
Sprite staging is persistent, and dense GPU domains avoid recurring readback.

The largest likely CPU costs are Water Tank particle/constraint work, Ball Pit at
stress settings, and JavaScript simulation plugins that still assemble per-frame
draw data. The largest upload is Splash PIC/FLIP at roughly 2.1 MiB/frame. Fluid
Tank reaches 37 draws, and Particle Fluid uses roughly 20.5 MiB of tracked GPU
memory. Those pass current budgets but are the first scalability pressure points.

Diagnostics measure CPU frame/system time, estimated GPU resources, and now
optional non-blocking disjoint GPU frame queries. The timer implementation has not
yet been exercised on the support matrix, and there are no pipeline-stall counters
or automatic buffer orphaning/ring-buffer policy. Thousands of conventional ECS
entities are credible; tens of thousands should use packed domains. The sparse-set
ECS is not archetype/chunk optimized and has no parallel scheduler yet.

## 4. Correctness

Kernel, scene, asset, hierarchy, serialization, and React failure paths have good
negative coverage. Structural mutation is rejected during schedules, deferred
commands are explicit, generations reject stale entities, and cleanup aggregates
failures instead of abandoning later resources. Physics replay hashes improve
regression detection.

The critical unknown is WebGL context restoration. All known resources register a
restoration path and deterministic ordering, but both forced-loss attempts caused
the embedded Chromium renderer to become blank before the application could report
equivalence. This may be an embedding limitation, but it cannot be called correct
without an external-browser pass. Async asset cancellation still depends on loader
cooperation. Floating-point determinism is same-runtime replay determinism, not
bit-identical cross-architecture determinism. Storage quota, audio-autoplay, worker
CSP, and browser eviction policies need broader device testing.

## 5. Engine design

Extensibility is good at the kernel, service, system, scene, asset-loader, schema,
input-source, and content-plugin layers. API ergonomics are credible for code-first
2D games: definitions compose plugins, scenes own entities, prefabs instantiate
content, and renderer-neutral components cover sprites, cameras, animation, and
text. Reference Arena proves the intended route.

Resource management and scene management are approaching production quality.
The asset pipeline has manifests, dependencies, leases, budgets, and safe reload,
but no offline importer/build cache, atlas packer, compression/transcoding, or
content-addressed derived-data cache. The ECS model is future-proof for normal 2D
games, while packed simulation domains are deliberately separate. A visual editor,
authoring serialization UI, and prefab diff workflow remain temporary/planned.

The renderer is production-capable for this catalog but not yet production-complete
as a general engine. Dynamic shader paths now have reflection, numbered source
diagnostics, and GPU frame timing, but it lacks material schemas, pipeline caches,
render-target pooling and masks/scissor hierarchy. Backend plugins can now insert
deterministically ordered passes around every built-in graph stage.

## 6. Missing features

Important remaining systems are GPU pipeline/stall counters, material validation
above the new shader reflection layer, a frame debugger beyond checksums, render-target
pool telemetry, derived asset processing, hot shader reload, input rebinding UI,
network/replay transport, localization, and editor UI. Cross-browser automation and
physical-device performance jobs are release requirements, not optional polish.
WebGPU and full 3D/PBR correctly remain post-release scope.

## 7. Technical debt

### Critical

1. Forced WebGL context loss/restoration lacks passing browser evidence.

### High

1. Supported Firefox/Safari/iOS/Android behavior and physical-mobile performance
   are not verified.
2. Optional GPU timing exists but is not yet device-matrix evidence; detailed
   stalls and per-pass costs can still pass CPU budgets unnoticed.
3. `WebGL2Renderer` still combines managed textures/fonts with frame orchestration,
   despite the first adapter extractions.

### Medium

1. Large simulation plugins duplicate controller/config/update patterns.
2. Splash PIC/FLIP performs a large recurring upload and will hit bandwidth limits
   before its advertised maximum on weaker devices.
3. The sparse-set ECS has no chunk iteration, change detection, or parallel system
   execution.
4. The production demo bundle is roughly 617 kB minified in one chunk.
5. Inspector stable-ID resolution is linear; acceptable for tooling, not bulk edits.

### Low

1. Demo-only experience selection is a nested conditional.
2. Some earlier local commits omit the conventional space after the scope colon.

## 8. If starting again

Keep the package boundaries, plugin lifecycle, backend-neutral contracts,
dual-authority data model, schemas/migrations, Reference Arena strategy, and
deterministic capture budgets. Those decisions paid off.

Design render-graph extension points and GPU diagnostics earlier. Separate renderer
facade, resource stores, frame orchestration, and context recovery from the start.
Define one reusable packed-domain lifecycle contract for simulation resources so
large plugins share reset/seed/diagnostic/capture behavior. Add a hermetic browser
test install before implementation begins. Do not return to a scene-object-per-
particle model or couple gameplay to raw WebGL.

## 9. Professional-engine comparison

Plugin ownership and schedule composition resemble Bevy's strengths; scenes,
resources, and code-first authoring are closer to Godot/Bevy than Unity. The device
and render contracts borrow useful bgfx/Filament separation, but the renderer lacks
their backend breadth, shader toolchain, validation, and frame instrumentation.
Failure-aware assets/scenes, deterministic captures, resource diagnostics, and the
conventional 2D vertical slice are approaching production quality.

The editor, import pipeline, shader/material toolchain, GPU profiler, render graph
extensibility, platform certification, and large-scale ECS scheduling remain
prototype-to-alpha quality compared with Unity, Unreal, Godot, Bevy, Filament,
bgfx, or Wicked Engine.

## 10. Grades

| Area | Grade | Reason |
|---|---|---|
| Architecture | B+ | Strong layers and ownership; renderer graph extensibility is incomplete. |
| Maintainability | B | Clean boundaries, but several large orchestrators/plugins need extraction. |
| Performance | B+ | All catalog budgets pass; actual GPU timing and physical devices are missing. |
| Scalability | B | Packed domains scale well; conventional ECS and scheduler are not chunked/parallel. |
| Rendering | B | Capable WebGL2 pipeline; restoration proof, shader tooling, and pooling are incomplete. |
| API design | B+ | Good code-first host/content contracts with backend neutrality. |
| Code quality | B+ | Strict, consistent, hygienic, and tested; concentration remains. |
| Production readiness | C+ | Strong RC, but critical browser recovery and support-matrix gates are open. |

## Merge and rewrite recommendation

Merge into an integration/release-candidate branch: yes. Replace the production
branch: no. A major rewrite is not justified. Use a targeted Hardening Pass 2 for
context-loss certification, browser/device coverage, GPU timing, and renderer
decomposition.

The five criticisms most likely from another senior engine programmer are:

1. You claim context recovery without one successful forced-loss browser run.
2. Desktop Chromium viewport emulation is not a mobile/browser support matrix.
3. CPU timing and estimated bytes are not a GPU profiler.
4. The renderer facade and several content plugins have accumulated too many jobs.
5. Shader/material tooling and render-target pooling remain thin for third-party render plugins.

## Hardening Pass 2

### High priority — must fix before production cutover

1. Run forced-loss equivalence on Chrome/Edge and Firefox outside the embedded
   browser; verify generation increments, counts/bytes are stable, rendering
   resumes, and repeated cycles do not leak.
2. Execute the supported browser/device functional matrix, including touch,
   pointer capture, gamepad, audio unlock, storage failure, workers, visibility,
   and accessibility.
3. Capture physical iOS/Android performance for all recommended profiles and tune
   any experience that violates the 30 FPS/resource envelope.

### Medium priority — should improve

1. Split renderer facade, managed 2D resources, fluid adapter, and frame orchestration.
2. Exercise the new optional disjoint GPU timer on the device matrix and add
   per-pass timings where supported.
3. Add shader compile/link source mapping, reflected uniform validation, and a
   development hot-reload path.
4. Expand the new stage-relative backend extension API to resource-declared custom
   render targets only when a concrete renderer plugin needs them.
5. Reduce Splash upload bandwidth and extract shared simulation-plugin lifecycle.

### Low priority — nice to have

1. Code-split the demo catalog and replace conditional selection with a registry.
2. Add archetype/chunk storage and parallel scheduling only after conventional-game
   profiles demonstrate a real need.
3. Build editor UI on `WorldInspector`, asset diagnostics, and scene serialization.

## Hardening Pass 2 progress

- Implemented a non-blocking `EXT_disjoint_timer_query_webgl2` frame timer. It
  polls delayed results, discards disjoint samples, resets across context loss,
  reports optional `gpuMs` through engine diagnostics, and displays unsupported
  state explicitly in the live overlay.
- The production source-aliased bundle rebuilt successfully after the complete
  local remediation slice (205 modules, 619.34 kB minified). Device-matrix timer
  evidence remains open.
- Added a shared labeled shader compiler/reflection layer for every content-provided
  fullscreen, field, simulation, and particle program. Driver failures now include
  stage and numbered source instead of renderer-specific opaque messages.
- Extracted `SpriteRenderQueue` and the restorable `WebGLFluidField2D` adapter from
  `WebGL2Renderer`; the facade fell from 728 to 645 lines without changing exports.
- Added `WebGL2FramePipelineService`: backend plugins can register deterministic,
  removable passes before or after every built-in stage. Duplicate/built-in IDs,
  invalid stages, and non-integer order values are rejected.
- Added a pull-request browser release matrix for Chromium, Firefox, and WebKit.
  Each isolated job verifies production Reference Arena accessibility, real touch
  event observation, gamepad polling, exact lifecycle replacement, and forced
  context-loss resource equivalence, then uploads a machine-readable report.
