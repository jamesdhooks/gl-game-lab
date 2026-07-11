# Reference parity

## Frozen references

The rebuild uses two detached, read-only worktrees:

- Core-clean feature reference: `1273b5f4145c5e9e87123cba535f5cc939a77a61`
- Historical main reference: `aef49f4b71cb4a75189b6eab9b630aab14aca760`

The core-clean revision is authoritative for experience behavior. The
historical main revision is available only for regression archaeology.

## Required parity evidence

Each experience must preserve:

- identity and registry presence;
- settings fields, defaults, ranges, and visibility;
- modes, gestures, styles, uniforms, and reset behavior;
- preview, play, demo, and AI behavior;
- tutorial and attribution content;
- deterministic interaction outcomes;
- equivalent scene composition and rendering methods;
- the same maintained style, palette, texture, shader, and material inputs;
- performance within the approved regression budget.

Visual parity is structural, not pixel-perfect. Captures must prove that the
same content is present, the scene reads and behaves the same, and equivalent
renderer families and passes produce it. SSIM, pixel hashes, and palette-level
color distances are diagnostics for catching gross regressions; minor
rasterization, antialiasing, particle-coordinate, and color differences do not
block parity when authoritative inputs and rendering methods match.

Dynamic experiences use deterministic frame sequences and a scene-specific
composition tolerance on one representative style. Additional palette variants
must preserve their maintained inputs and render path and remain browser-clean;
they do not each repeat the physics acceptance gate. CPU and GPU p95 frame time
may not regress more than ten percent at equivalent settings without a
committed architecture waiver.

## Experience ledger

The machine-readable ledger lives in `reference-manifest.json`. Status changes
must include the tests and capture identifiers that justify them.
