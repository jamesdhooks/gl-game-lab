# Sparks Render-Tier and Emissive Lighting Audit — 2026-07-17

## Verdict

The Sparks tiers are now materially different render pipelines over the same compiled GPU simulation. Basic is a single point layer, Enhanced is a three-layer point/streak treatment, and Ultra adds half-resolution persistent trails plus reusable fullscreen emissive effects. The implementation is suitable for reuse by Fireworks and other particle scenes, but the light-shaft implementation is a deliberately inexpensive screen-space approximation rather than an occlusion-aware lighting model.

## Delivered architecture

| Area | Result | Evidence |
|---|---|---|
| Layered recipes | Pass | Compiled point, core, halo, and streak descriptors carry independent scale, length, intensity, alpha, blend, and archetype masks. Legacy booleans still normalize into layers. |
| Basic | Pass | One additive point pass; no trails or post-process target. |
| Enhanced | Pass | Halo, swept-streak, and core passes. Length and continuity feed the streak uniforms. No framebuffer history or fullscreen post effect. |
| Ultra | Pass | Enhanced-style layers feed half-resolution trail history, then threshold bloom, environment light, shafts, and localized heat distortion composite the scene. |
| Reusable post effects | Pass | Bloom and emissive lighting live in the WebGL2 renderer and are exposed through backend-neutral renderer options rather than Sparks-only shader branches. |
| Settings | Pass | Existing keys remain intact. Threshold, radius, environment light, shafts, shaft length, and distortion are Ultra-only and have descriptions. Zero strengths skip their optional work. |
| Preview safety | Pass | Preview values are capped; post effects use reduced resolution; capacity-aware render thinning lowers particle render density without changing simulation. |
| GPU residency | Pass | Light positions come from the known active emitter. No particle readback or full-state CPU upload was added. |
| Lifecycle | Pass | Resize, DPR, context rebuild, pooled targets, shader reuse, and disposal use the existing renderer resource lifecycle. |

## Visual and performance acceptance

Browser captures at 1440x900 with the same welding workload are committed as:

- `docs/captures/particle/sparks-basic.png`
- `docs/captures/particle/sparks-enhanced.png`
- `docs/captures/particle/sparks-ultra.png`

The live browser reported 60 FPS for all three captures and no page errors on the local reference machine. Basic renders crisp dots, Enhanced visibly produces velocity-scaled lines, and Ultra produces persistent luminous trajectories, a dominant-source glow, and environmental response. This is a qualitative browser gate, not a portable GPU timing certification.

Cost scales in the intended order:

- Basic: one particle layer and no intermediate target.
- Enhanced: three particle layers and no fullscreen post process.
- Ultra: three particle layers into half-resolution history, trail composite, and only the enabled emissive/post passes.

At the saved 590k capacity, Ultra thins rendering toward roughly 196k submitted particles while preserving the full simulation. Enhanced targets roughly 393k rendered particles. This is important: visual LOD does not alter collisions, emission, lifetime, or particle state.

## Correctness and compatibility

- Tier selection changes rendering only; all tiers share one simulation resource and state ABI.
- Existing size, alpha, lifetime, intensity, palette, length, continuity, trail fade, and bloom-strength settings remain wired.
- Environmental lighting decays after input release, so a released pointer cannot leave a stale source.
- Build elements are included in the captured scene before the post composite, allowing Ultra lighting/distortion to affect the whole environment coherently.
- The focused suite passes 52 tests across compiler normalization, runtime bindings, post effects, renderer lifecycle, setting visibility, and Sparks contracts.

## Remaining limitations

1. Light shafts are radial screen-space scattering from one dominant source. They do not test scene geometry for occlusion and should not be described as volumetric lighting.
2. Adaptive degradation is capacity/profile driven. The renderer does not yet use GPU timer-query feedback to change bloom iterations or effect resolution dynamically within a running Sparks scene.
3. The WebGPU prototype understands the common particle semantics but does not yet execute this complete layered fullscreen post stack. WebGL2 is the accepted production path for these effects.
4. Current captures validate distinction and stability, not pixel-exact output. Driver-specific golden-image tolerances are still absent.
5. Bloom, illumination, shafts, and distortion share one compact post-process implementation. This is efficient, but a future render-graph compositor would offer finer pass scheduling and independent effect reuse.

## Grades

| Category | Grade | Rationale |
|---|---|---|
| Architecture | A- | Reusable semantic layers and renderer-owned effects; remaining monolithic post compositor. |
| API design | A- | Typed descriptors, compatibility normalization, clean scene-facing controls. |
| Rendering | A- | Clear tier separation and credible Ultra treatment; approximate shafts. |
| Performance | B+ | Strong pass skipping, fractional targets, and render thinning; no live GPU-timer adaptation. |
| Scalability | A- | Full simulation remains GPU-resident and render cost can thin independently. |
| Maintainability | B+ | Shared infrastructure removes scene duplication, but embedded GLSL remains costly to evolve. |
| Production readiness | B+ | Browser-stable and tested on WebGL2; broader device timing and context-loss browser matrices remain release work. |

## Final assessment

The original goal is met: Basic, Enhanced, and Ultra are no longer cosmetic labels over nearly identical rendering. The system is extensible enough to give Fireworks its own layer compositions without duplicating post shaders. No additional refactor pass is required before using these APIs in another scene. The next valuable hardening pass should be driven by measured cross-device GPU timings, specifically timer-query-based adaptive post-effect quality and mobile validation.
