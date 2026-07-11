# GLGameLab production 2D completion audit — 2026-07-11

This matrix tests the original production-hardening objective against current,
authoritative evidence. A green build or compatible public type is not treated as
proof of a broader runtime, performance, or platform claim.

## Verdict

The repository implementation is complete for the approved production 2D scope.
The release candidate is **not yet certified for production cutover** because
two acceptance requirements need evidence that this repository and hosted CI
cannot manufacture:

1. recommended-profile performance on physical iOS and Android devices;
2. James's human scene-by-scene behavior/rendering parity approval.

These are evidence gaps, not waived requirements. The feature branch remains an
integration/release-candidate branch until they pass.

## Status legend

| Status | Meaning |
|---|---|
| Proven | Current evidence directly covers the requirement |
| External signoff | Implementation and hosted evidence pass, but required physical/human evidence is absent |
| Deferred | Explicitly outside the approved production 2D target |

## Requirement matrix

| Requirement | Status | Authoritative evidence | Assessment |
|---|---|---|---|
| Preserve the public experience/host contract | Proven | `ExperienceDefinition`, runtime-controller, `ExperienceRuntime`, and `GameCanvas` tests; three-engine launcher gate; live GitHub Pages build | Experience IDs, modes, settings, styles, intro/tutorial metadata, runtime replacement, and exact-once teardown remain available through the public host. |
| Restore the established demo product | Proven | `DEM-01`; `.github/workflows/browser-release.yml`; `scripts/verify-browser-release.mjs`; deployed 15-card gallery | The live GLGameLab gallery provides one game, fourteen simulations, previews, filters, demo cycling, intro cards, modes, styles, complete settings, tutorials, reset/quit, responsive chrome, and three-side navigation. |
| Rebuild kernel lifecycle and ownership | Proven | Nine `Engine` tests; ownership snapshots; failure-injection and cleanup aggregation cases; `KRN-01`/`KRN-02` | Partial initialization, start failure, async reverse teardown, idempotency, and terminal recovery are explicitly tested. |
| Make ECS, hierarchy, scheduling, and serialization production-capable | Proven | 32 focused `World`, `Hierarchy`, `Schedule`, `Serialization`, and snapshot tests; Reference Arena | Generational identity, query locks, command-buffered mutation, hierarchy, migrations, and scene-owned conventional gameplay are covered. Packed/GPU domains remain the documented authority for homogeneous high-count simulations. |
| Implement robust scene management | Proven | Seven `SceneManager` tests; `SCN-01` | Additive/exclusive transitions, serialization, cancellation, rollback, persistence, and failure cleanup are covered. |
| Implement production asset ownership and pipeline services | Proven | Eleven `AssetManager` tests; web texture tests; `AST-01`/`AST-02` | Manifests, dependency validation, deterministic request identity, leases, budgets, diagnostics, cancellation behavior, and safe development reload are present. Offline import/derived-data tooling is future tooling, not a release requirement. |
| Establish backend-neutral rendering contracts | Proven | Package-boundary gate across ten packages; zero content imports from `render-webgl2`; `RND-03` | All 15 experiences depend on engine-level 2D/GPU contracts rather than WebGL implementation types. |
| Use a real shipping render graph with extensible stages | Proven | `RenderGraph` and frame-pipeline tests; seven built-in shipping stages; deterministic backend pass registration | Frame execution uses the compiled graph. Plugins can register ordered removable passes before/after built-in stages with validation. Custom resource-declared render targets remain an intentional later extension. |
| Provide deterministic GPU resource ownership and restoration | Proven | 59 renderer tests; hosted Chromium/Firefox/WebKit registry reports; headed physical-host Chrome 150, Edge 150, and Firefox 151 driver cycles; `RND-01` | Real `WEBGL_lose_context` cycles advance generation 0→1, restore all 6 resources, preserve 9,280 tracked bytes, resume rendering, and emit no page errors. The physical run found and remediated both restore scheduling and device-state defects. |
| Remove known renderer and physics hot-path defects | Proven | 10,000-sprite batching regression; active-count upload tests; dense/conventional broad-phase diagnostics; deterministic replay hashes | Quadratic sprite batching, capacity-based upload accounting, and repeated grid construction were removed. Current catalog captures pass the executable budgets. |
| Implement platform services and lifecycle policy | Proven | 15 platform-web tests; engine service contracts; three-engine touch/gamepad/lifecycle/accessibility gate; Reference Arena | Input/action maps, pointer capture, gamepad, focus/visibility, audio, storage, workers, accessibility, and React teardown have explicit contracts and hosted runtime evidence. Physical policy behavior is additionally covered by the mobile signoff row. |
| Prove a conventional code-first 2D authoring path | Proven | Reference Arena production browser probe; `DES-01` | ECS sprites, cameras, animation, bitmap text, sorting/culling, physics, input, audio, saves, and accessibility operate together without content/backend coupling. |
| Migrate and validate all 15 release experiences | Proven | `pnpm check:catalog`; 14 simulation suites plus Ball Pit; 30 deterministic captures; browser shell gate | Exactly 15 registry entries ship, use supported engine paths, boot through production output, and satisfy their automated contracts. |
| Preserve scene behavior and rendering | External signoff | Automated controller tests, deterministic captures/checksums, live previews, and three-engine launcher checks | Code paths and underlying color/render inputs are preserved and all scenes run. Per the agreed acceptance policy, final qualitative parity is a human review rather than pixel/color matching; that approval has not yet been recorded. |
| Meet the reference desktop 60 FPS tier | Proven | 15 × 120-frame production Chromium captures at 1280×720; `performance-browser-matrix-2026-07-11.md` | Every recommended desktop profile passes CPU p95, draw, upload, transient-allocation, and tracked GPU-memory budgets. This is deterministic reference-hardware evidence, not a claim about every desktop GPU. |
| Meet the reference mobile 30 FPS tier | External signoff | 15 × 120-frame 390×844 touch/viewport captures pass; executable mobile budgets | The mobile policy and all recommended profiles pass desktop viewport emulation. The release target explicitly requires physical modern-mobile evidence, so iOS Safari and Android Chrome remain open. |
| Provide profiling, diagnostics, validation, and development workflows | Proven | Diagnostics overlay/capture, CPU and optional disjoint GPU timing, resource/pass inspection, shader reflection/source mapping, `WorldInspector`, safe asset reload, development workflow docs | The required production-debugging floor exists. A full frame debugger, editor, importer, and material pipeline remain professional-engine roadmap items, not approved cutover gates. |
| Enforce repository quality and CI | Proven | Fresh local boundary/hygiene/catalog/test run; 71 files and 229 tests; green `verify` plus Chromium/Firefox/WebKit PR jobs | The repository owns test discovery, strict type/build gates, package boundaries, and source hygiene. Hosted and local gates agree. |
| Repeat the independent ten-section audit and remediate failures | Proven | `production-re-audit-2026-07-11.md`; Hardening Pass 2 history; this completion matrix | The audit was repeated, its implementation findings were remediated, and residual release items are classified without downgrading or waiving them. |
| WebGPU, full 3D/PBR, and production visual editor | Deferred | `DES-02`; engine architecture ADRs | These were explicitly post-release. Current boundaries avoid precluding them. |

## Fresh verification snapshot

Run from the release-candidate worktree on 2026-07-11:

- `pnpm check:boundaries`: ten workspace package boundaries verified.
- `pnpm check:hygiene`: zero tracked formatting-debt files.
- `pnpm check:catalog`: 15 release experiences verified.
- `pnpm test`: 71 test files and 229 tests passed (including the new physical
  restoration state regression).
- Pull request checks: `verify`, Chromium, Firefox, and WebKit passed.
- GitHub Pages: public, HTTPS-enforced, and built from `gh-pages` at
  <https://jamesdhooks.github.io/gl-game-lab/>.

## Cutover rule

Do not replace the production branch merely because implementation work is
finished. Cutover becomes eligible only when the two external-signoff rows are
changed to **Proven** with dated device/browser or human-review evidence. Any
failure opens another targeted remediation pass and reruns the affected automated
and external gates.
