# Production 2D hardening ledger

This ledger is the release-control record for the production hardening program.
An item is complete only when its acceptance evidence is linked here. Passing a
typecheck or preserving an API shape is not sufficient evidence for runtime,
performance, or lifecycle claims.

## Release target

- Production-grade WebGL2 2D engine with backend-neutral rendering contracts.
- Public compatibility for `ExperienceDefinition`, runtime controllers,
  `ExperienceRuntime`, `GameCanvas`, experience IDs, modes, settings, and styles.
- Current Chrome, Edge, Firefox, Safari, iOS Safari, and Android Chrome where
  WebGL2 is available.
- Recommended content targets 60 FPS on reference desktop hardware and 30 FPS
  on reference modern mobile hardware. Maximum settings are labelled stress mode.
- The release candidate must pass a fresh ten-section engineering re-audit. Any
  failed release criterion opens a second hardening pass rather than being waived.

## Status legend

| Status | Meaning |
|---|---|
| Open | Confirmed debt with no accepted implementation |
| Active | Work is in progress on a focused branch slice |
| Verified | Implementation and acceptance evidence are recorded |
| Deferred | Explicitly outside the production 2D release target |

## Findings and acceptance evidence

| ID | Severity | Finding | Planned phase | Status | Required evidence |
|---|---:|---|---:|---|---|
| KRN-01 | Critical | Engine initialization and shutdown can strand lifecycle state when cleanup rejects. | 3 | Verified | Failure-injection tests cover partial install/start, cleanup aggregation, idempotent stop/destroy, and terminal state recovery. |
| KRN-02 | High | Plugin/resource ownership and teardown order are insufficiently explicit. | 3 | Verified | Engine ownership snapshots expose dependencies, extensions, and resources; engine-owned cleanup is reverse-order, async-safe, and tested. |
| ECS-01 | High | ECS, hierarchy, scenes, and serialization are not the content runtime's authoritative model. | 3, 6, 7 | Verified | Reference Arena drives scene-owned ECS gameplay; all 15 experiences use engine contracts; the documented dual-authority model deliberately keeps homogeneous high-count simulation state in scheduled engine-owned packed/GPU domains. |
| ECS-02 | High | Structural mutation and query invalidation semantics are incomplete for scheduled systems. | 3 | Verified | Tests cover query locks, command-buffered scheduled mutation, stale generations, prevalidated spawn, reentrant despawn, and runner failure recovery. |
| SCN-01 | High | Scene transitions, async loading, persistence, and failure recovery are incomplete. | 3 | Verified | Additive and serialized exclusive transitions, in-flight cancellation, activation rollback, and failure-cleanup tests pass. |
| AST-01 | Critical | Concurrent asset-group failure can leak leases; request identity omits behavior-affecting options. | 3 | Verified | Concurrent group/release and failed-parent dependency tests prove zero leases remain; deterministic option keys reject incompatible reuse. |
| AST-02 | High | No production asset manifest, dependency graph, budgets, or hot-reload path. | 5, 8 | Verified | Validated manifests reject missing/cyclic dependencies; cache bytes, budget events, diagnostics, and zero-reference development reload are tested. |
| RND-01 | Critical | WebGL context restoration does not recreate owned GPU resources. | 4 | Active | All resources have ordered restoration; the PR browser matrix now requires generation/count/byte equivalence in Chromium, Firefox, and WebKit. Passing hosted reports remain required. |
| RND-02 | High | RenderGraph is test-only while shipping rendering uses fixed manual ordering. | 4 | Verified | Shipping WebGL2 frames execute seven compiled graph passes over an external frame destination and expose pass/resource diagnostics. |
| RND-03 | High | Public content imports concrete WebGL2 renderer APIs, preventing backend neutrality. | 4, 6, 7 | Verified | All 15 shipped experiences use engine-level 2D/GPU contracts; games and simulations have zero renderer-package imports and simulations no longer depend on the WebGL2 package. |
| RND-04 | High | Sprite draw-plan construction copies arrays per sprite and is quadratic. | 4 | Verified | Builder now appends to one mutable construction batch and freezes once; a 10,000-sprite regression case verifies one batch. |
| RND-05 | High | GPU ownership, descriptor validation, pooling, and destruction are inconsistent. | 4 | Verified | Stable ownership IDs, prioritized restoration, deterministic unregistration, texture/context byte estimates, counts, and generation diagnostics cover managed GPU resources. |
| PRF-01 | High | Hot paths allocate temporary objects/arrays and upload avoidable full buffers per frame. | 4, 7, 8 | Verified | Persistent sprite staging removed backing allocations; upload diagnostics use active counts. Fresh Splash captures corrected false 2.1 MiB readings to 124,568/132,248 bytes while both tiers pass. |
| PRF-02 | High | Particle collision grids are rebuilt more often than required. | 7 | Verified | Dense and conventional worlds build broad-phase pairs once per substep, reuse them across solver passes, and expose tested build/pair/pass counters. |
| PRF-03 | High | No enforceable desktop/mobile frame-time, memory, draw-call, or upload budgets exist. | 8, 9 | Active | Executable 60/30 FPS budgets cover p95 CPU, draws, uploads, and GPU bytes; all 30 Chromium desktop/mobile-viewport captures pass. Physical mobile and cross-browser sign-off remain. |
| PHY-01 | Critical | Splash MPM is labelled beyond its implemented PIC/FLIP-style solver and silently clamps advertised limits. | 7 | Verified | Display/metadata now identify PIC/FLIP and explicitly reject MPM terminology; the advertised 131,072 capacity is the real validated capacity. |
| PHY-02 | High | Physics APIs lack broad-phase/solver diagnostics and production determinism coverage. | 7, 8 | Verified | Stable replay hashes, deterministic tests, and broad-phase/pair/contact/solver/substep counters ship for dense and conventional physics. |
| WEB-01 | Critical | React teardown ignores asynchronous destroy failures and definition changes can desynchronize host/runtime state. | 5 | Verified | Exact-once async destruction and definition-state reset are unit-tested; production Chromium same-mount replacement proved the old engine destroyed and the new definition reached running. |
| WEB-02 | High | Input lacks action maps, gamepad, focus/visibility policy, and complete pointer capture semantics. | 5 | Active | Input contracts are unit-tested; the PR browser matrix now requires touch down/up observation and a polled standard gamepad in Chromium, Firefox, and WebKit. Passing hosted reports remain required. |
| WEB-03 | High | Audio, storage, worker services, and accessibility contracts are absent. | 5 | Verified | Engine-owned contracts and browser implementations cover audio, validated storage, cancellable workers, and ARIA live regions; Reference Arena uses them and Chromium exposed its live score announcement. |
| QLT-01 | High | Large portions of TypeScript are one-line/minified and resist review and maintenance. | 2 | Verified | Formatting baseline is empty; source hygiene and all-package typecheck pass; 66 focused test files are tracked. |
| QLT-02 | High | Tests are predominantly shallow API tests; real GL, leaks, lifecycle failure, and performance are weakly covered. | 2-9 | Active | Unit/integration/performance coverage and a three-engine PR release workflow exist; hosted context/touch/gamepad reports and physical devices remain outstanding evidence. |
| QLT-03 | High | CI, source hygiene, and package-boundary enforcement were absent. | 2 | Verified | Required CI executes frozen install, boundaries, hygiene, typecheck, tests, and build on pull requests and main pushes. |
| TOL-01 | Medium | Diagnostics, frame/resource inspection, GPU debugging, and capture tooling are incomplete. | 8 | Verified | Overlay/capture expose CPU/GPU timing and resources; every renderer shader uses one labeled compiler with numbered-source failures, reflection, and required-uniform validation. |
| TOL-02 | Medium | Serialization/editor inspection/hot reload lack production workflows. | 3, 8 | Verified | Versioned fixtures, schema-backed `WorldInspector` editing, safe zero-lease asset reload, tests, and development workflow documentation are present. |
| DES-01 | Medium | Animation, cameras, UI layout/text, and a conventional 2D authoring layer are incomplete. | 5, 6 | Verified | Backend-neutral ECS sprites, cameras, animation, bitmap text, culling, sorting, and extraction drive Reference Arena; production Chromium rendered it with physics, input, audio, saves, and accessibility. |
| DES-02 | Low | Full WebGPU backend, PBR 3D renderer, and production editor are not required for this release. | Post-release | Deferred | Backend contracts and ADRs must avoid precluding later implementations. |

## Phase exit gates

1. **Repository gates:** CI and local checks are reproducible; all formatting debt
   is visible and no new debt can enter.
2. **Kernel foundation:** lifecycle, ECS, scenes, serialization, and assets pass
   failure, cancellation, ownership, and migration tests.
3. **Renderer:** backend-neutral contracts drive a real render graph; context
   restoration and GPU ownership are proven.
4. **Platform:** input, audio, storage, workers, accessibility, and React host
   teardown have explicit service and lifecycle contracts.
5. **Reference Arena:** one conventional 2D game slice uses the complete public
   authoring path before broad migration begins.
6. **Experience migration:** all 15 experience definitions preserve their public
   behavior and use supported engine paths without renderer-private imports.
7. **Production evidence:** diagnostics and tiered performance gates pass on the
   supported browser/device matrix.
8. **Independent re-audit:** the original ten audit sections are repeated against
   the release candidate; unmet criteria trigger Hardening Pass 2.
