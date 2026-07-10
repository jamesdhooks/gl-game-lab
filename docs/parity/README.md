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
- visual composition within the approved tolerance;
- performance within the approved regression budget.

Static captures target an SSIM score of at least `0.97`. Dynamic experiences
use deterministic frame sequences and a scene-specific temporal tolerance.
CPU and GPU p95 frame time may not regress more than ten percent at equivalent
settings without a committed architecture waiver.

## Experience ledger

The machine-readable ledger lives in `reference-manifest.json`. Status changes
must include the tests and capture identifiers that justify them.
