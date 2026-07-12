# GLGameLab production 2D re-audit — 2026-07-11

## Decision

This release candidate is suitable for an integration/RC branch. The architecture
does not need a broad rewrite, clean CI passes, and the hosted Chromium, Firefox,
and WebKit release matrix is green. Headed physical-host Chrome, Edge, and Firefox
driver-loss cycles now pass. Production cutover still requires human scene parity
review and physical iOS/Android performance.

## Evidence reviewed

- Ten workspace packages with enforced dependency boundaries and zero source
  hygiene exceptions.
- 73 test files and 234 passing tests in the fresh workspace run, plus production
  Chromium fixed-frame, lifecycle, and accessibility probes.
- All 15 shipped experiences through engine-level render contracts; content has
  zero concrete WebGL renderer imports or WebGL context types.
- Thirty 120-frame desktop/mobile-viewport captures, all within executable CPU,
  draw, upload, transient allocation, and GPU-memory budgets.
- Current branch frozen install, boundary and hygiene checks, all TypeScript builds
  and typechecks, tests, and production Vite build pass in clean hosted CI.
- Hosted Chromium, headed Firefox under Xvfb, and WebKit reports pass production
  accessibility, touch, gamepad, lifecycle, and resource-rebuild invariants.
- The public GitHub Pages build exposes the restored 15-card live gallery and
  immersive launcher. The three-engine gate checks filtering, intro, complete
  Ball Pit settings, tutorials, and dockable experience navigation.
- Real headed Chrome 150, Edge 150, and Firefox 151 driver-loss cycles advance
  resource generation and preserve resource counts/bytes without page errors.

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

Maintainability is reduced by concentration. `WebGL2Renderer.ts` began at 728 lines
and owned facade APIs, managed textures/fonts/fluids, pass orchestration,
diagnostics, restoration, and plugin installation. Hardening remediation extracted
its sprite queue, restorable fluid adapter, managed texture/font/glyph owner, and
the complete frame-execution/diagnostics coordinator. The facade is now explicit
dependency wiring plus submission and restoration policy; its 616 lines remain a
size signal, but frame pass state and accounting no longer live there.
`DenseCircleParticleWorld2D.ts` is 651 lines; `AssetManager.ts` is 583. Sparks and
orbital-shrapnel plugins exceed 450 lines.
These are not unreadable, but they are clear extraction candidates. Hardening
Pass 2 removed the demo's nested selector in favor of an async registry-backed
loader with explicit game/simulation chunk boundaries.

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
draw data. Splash PIC/FLIP's apparent 2.1 MiB upload was corrected in Hardening
Pass 2: diagnostics counted capacity rather than the active subarrays actually
transferred; fresh captures report about 122–129 KiB/frame. Fluid
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

All known GPU resources register deterministic invalidation/restoration paths.
Hosted Chromium, Firefox, and WebKit rebuild every owned resource and preserve
generation/count/byte invariants. Headed installed Chrome and Edge plus headed
Firefox on the physical Windows host now pass real `WEBGL_lose_context` recovery.
Those runs exposed two defects: restore was requested before the lost event had
fully completed, and the device remained internally guarded as lost while its
resource restorers ran. Both are fixed and regression-covered. An earlier desktop
embedded-browser attempt also exposed a separate host defect: inline
callback identity changes rebuilt `GameCanvas` while its context was lost. Callbacks
now use live refs, the engine remains single-mounted, and restoration work waits for
a post-event driver turn. Async asset cancellation still depends on loader
cooperation. Floating-point determinism is same-runtime replay determinism, not
bit-identical cross-architecture determinism. Storage quota, audio-autoplay, worker
CSP, and browser eviction policies need broader device testing.

## 5. Engine design

Extensibility is good at the kernel, service, system, scene, asset-loader, schema,
input-source, and content-plugin layers. API ergonomics are credible for code-first
2D games: definitions compose plugins, scenes own entities, prefabs instantiate
content, and renderer-neutral components cover sprites, cameras, animation, and
text. Reference Arena proves the intended route. The restored demo shell is again
a first-class consumer of the same definitions: modes, styles, setting schemas,
tutorial pages, and capabilities drive reusable launcher UI without content-specific
imports.

Resource management and scene management are approaching production quality.
The asset pipeline has manifests, dependencies, leases, budgets, and safe reload,
but no offline importer/build cache, atlas packer, compression/transcoding, or
content-addressed derived-data cache. The ECS model is future-proof for normal 2D
games, while packed simulation domains are deliberately separate. A visual editor,
authoring serialization UI, and prefab diff workflow remain temporary/planned.

The renderer is production-capable for this catalog but not yet production-complete
as a general engine. All built-in and dynamic shader paths now have reflection,
numbered source diagnostics, required-uniform validation, and GPU frame timing,
but it lacks material schemas, pipeline caches,
render-target pooling and masks/scissor hierarchy. Backend plugins can now insert
deterministically ordered passes around every built-in graph stage.

## 6. Missing features

Important remaining systems are GPU pipeline/stall counters, material validation
above the new shader reflection layer, a frame debugger beyond checksums, render-target
pool telemetry, derived asset processing, hot shader reload, input rebinding UI,
network/replay transport, localization, and editor UI. Cross-browser automation now
passes; physical-device performance remains a release requirement, not optional polish.
WebGPU and full 3D/PBR correctly remain post-release scope.

## 7. Technical debt

### High

1. Physical Safari/iOS/Android behavior and mobile performance are not verified;
   hosted Chromium, Firefox, and WebKit behavior is verified.
2. Optional GPU timing exists but is not yet device-matrix evidence; detailed
   stalls and per-pass costs can still pass CPU budgets unnoticed.
3. `WebGL2Renderer` still wires renderer-family adapters and context restoration,
   though managed textures/fonts, fluids, queues, glyph expansion, frame execution,
   and diagnostics aggregation now have dedicated owners.

### Medium

1. Large simulation plugins duplicate controller/config/update patterns.
2. Capacity-based CPU particle renderers still scale linearly at stress settings;
   active-count upload diagnostics now expose that cost accurately.
3. The sparse-set ECS has no chunk iteration, change detection, or parallel system
   execution.
4. Inspector stable-ID resolution is linear; acceptable for tooling, not bulk edits.

### Low

1. Some earlier local commits omit the conventional space after the scope colon.

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
| Rendering | A- | Capable WebGL2 pipeline, hosted cross-engine reconstruction, and real Chrome/Edge/Firefox driver recovery; pooling/tooling remain. |
| API design | B+ | Good code-first host/content contracts with backend neutrality. |
| Code quality | B+ | Strict, consistent, hygienic, and tested; concentration remains. |
| Production readiness | B | Automated RC and physical desktop driver gates are green; physical mobile and human parity remain. |

## Merge and rewrite recommendation

Merge into an integration/release-candidate branch: yes. Replace the production
branch only after physical mobile evidence and human parity review. A
major rewrite is not justified; remaining work is targeted certification and
renderer/tooling evolution.

The five criticisms most likely from another senior engine programmer are:

1. Desktop viewport emulation is not physical mobile performance evidence.
2. Safari/iOS policy behavior still needs physical-device certification.
3. CPU timing and estimated bytes are not a full GPU profiler.
4. The renderer facade and several content plugins have accumulated too many jobs.
5. Shader/material tooling and render-target pooling remain thin for third-party render plugins.

## Hardening Pass 2

### High priority — must fix before production cutover

1. Execute the physical iOS/Android functional and performance matrix, including
   touch, pointer capture, audio unlock, storage failure, workers, visibility,
   accessibility, and all recommended profiles. Tune any experience that violates
   the 30 FPS/resource envelope.

### Medium priority — should improve

1. Completed: split managed 2D resources, fluid adapter, queues, and frame
   execution/diagnostics from the renderer facade. Further renderer-family/context
   extraction should be driven by a concrete backend or plugin requirement.
2. Exercise the new optional disjoint GPU timer on the device matrix and add
   per-pass timings where supported.
3. Add shader compile/link source mapping, reflected uniform validation, and a
   development hot-reload path.
4. Expand the new stage-relative backend extension API to resource-declared custom
   render targets only when a concrete renderer plugin needs them.
5. Extract shared simulation-plugin lifecycle; continue moving stress-scale CPU
   particle domains to GPU-resident state when profiling justifies it.

### Low priority — nice to have

1. Add archetype/chunk storage and parallel scheduling only after conventional-game
   profiles demonstrate a real need.
2. Build editor UI on `WorldInspector`, asset diagnostics, and scene serialization.

## Hardening Pass 2 progress

- Extracted `WebGL2FrameOrchestrator` from the renderer facade. It owns the seven
  shipping-pass execution boundary, closes GPU timers on stage failure, and emits
  one immutable diagnostics snapshot from explicit metric sources. Per-frame
  upload/draw counters now clear in a `finally` path so a failed stage cannot leak
  stale costs into the next frame. Two focused regressions bring the fresh suite
  to 73 files and 234 tests; the full Chromium shell/functional/context gate passes.

- Implemented a non-blocking `EXT_disjoint_timer_query_webgl2` frame timer. It
  polls delayed results, discards disjoint samples, resets across context loss,
  reports optional `gpuMs` through engine diagnostics, and displays unsupported
  state explicitly in the live overlay.
- The production bundle rebuilt successfully after the complete local remediation
  slice and restored shell. Its former monolith is now five main JavaScript chunks
  (19.96, 22.29, 141.67, 222.44, and 359.07 kB) with no size warning.
  Device-matrix timer evidence remains open.
- Added a shared labeled shader compiler/reflection layer for every content-provided
  fullscreen, field, simulation, and particle program. Driver failures now include
  stage and numbered source instead of renderer-specific opaque messages.
- Extracted `SpriteRenderQueue` and the restorable `WebGLFluidField2D` adapter from
  `WebGL2Renderer`, then extracted managed textures, bitmap fonts, and glyph
  expansion into `ManagedRender2DResources`; the facade fell from 728 to 610 lines
  without changing exports or ownership semantics.
- Added a repository-owned Node Vitest configuration. Package-local test wrappers
  now execute their actual suites in nested worktrees instead of inheriting the
  legacy parent checkout and reporting false zero-test success.
- Exercised the real driver-loss strategy in the desktop embedded browser. The probe
  found callback prop churn could remount the engine during loss; `GameCanvas` and
  `ExperienceRuntime` now retain live callbacks without making them engine-build
  dependencies, and driver resource restoration is deferred one driver turn. The
  repaired host stays at `readyCount=1` with no shader/runtime error. This embedded
  driver still times out without emitting `webglcontextrestored`, so physical desktop
  restoration required a supported installed-browser run rather than a claimed pass.
- Added installed-browser/headed/scope controls to the release harness and ran
  real physical-host driver cycles. Chrome 150, Edge 150, and Firefox 151 all pass
  with generation 0→1, 6/6 resources, 9,280/9,280 bytes, resumed rendering, and
  no page errors. The runs found and fixed premature restore scheduling and an
  incorrect device-lost guard during registered restoration.
- Added `WebGL2FramePipelineService`: backend plugins can register deterministic,
  removable passes before or after every built-in stage. Duplicate/built-in IDs,
  invalid stages, and non-integer order values are rejected.
- Added a passing pull-request browser release matrix for Chromium, Firefox, and
  WebKit. Each isolated job verifies production Reference Arena accessibility,
  real touch event observation, gamepad polling, exact lifecycle replacement, and
  explicit registry-rebuild resource equivalence, then uploads a machine-readable
  report. Real desktop driver-loss is recorded separately in the physical matrix.
- Corrected segment, mesh, and metaball upload accounting to use active element
  counts rather than backing-array capacity. Fresh Splash production captures fell
  from false ~2.1 MiB readings to 124,568 bytes desktop and 132,248 bytes mobile.
- Replaced the demo's nested selector/static catalog imports with async
  `SIMULATION_REGISTRY` resolution and dynamic game/simulation package boundaries.
  Ball Pit, Turing Skin, Particle Fluid, Splash capture, Reference Arena lifecycle,
  and unknown-ID fallback routes passed against the production output.
- Restored the established demo product shell under GLGameLab branding: live
  gallery previews, category filters, demo cycling, intro cards, immersive controls,
  complete tuning drawers, tutorials, responsive mobile chrome, and dockable
  three-side navigation. A preview teardown race found during browser QA now defers
  destruction until boot settles. The shell passes Chromium, Firefox, and WebKit
  and is deployed at `https://jamesdhooks.github.io/gl-game-lab/`.
- Replaced the interim simplified toolbar with a direct port of the established
  React/Tailwind launcher components. The original HUD, adaptive overflow sheet,
  mode toggle, portal style picker, centered intro card, resolution/settings
  drawer, floating top controls, hide/restore UI, demo/info actions, and mobile
  carousel layout now call the new runtime controller underneath. Browser gates
  assert the legacy desktop and 390×844 mobile control contracts explicitly.
- Added a deployed physical-mobile certification route. It serially runs all 15
  recommended profiles with explicit engine teardown, applies the existing mobile
  budgets, exports machine-readable device/results evidence, and refuses to pass
  desktop, alternate-iOS-browser, Android-WebView, or other unsupported reports.
- Routed the remaining bloom, backdrop, trail, segment, triangle-mesh, and
  metaball programs through `createShaderProgram`. Required locations are cached
  and validated once; recurring palette/background allocations were removed.
  Representative production scenes exercising every shader family reached
  `running` without engine errors.
- Reconciled the complete objective against current evidence in
  `completion-audit-2026-07-11.md`. Repository implementation requirements are
  proven; physical driver recovery, physical iOS/Android performance, and human
  scene parity remain explicit production-cutover signoffs rather than waivers.
