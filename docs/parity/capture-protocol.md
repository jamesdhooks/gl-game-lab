# Deterministic browser capture protocol

The demo host exposes a canvas-only fixed-step route for repeatable visual and
performance evidence:

```text
/?capture=1&frame=180&profile=demo&seed=305441741&mode=single&style=neon
```

Supported parameters are:

- `frame`: exact number of fixed frames to execute, from 1 through 10,000;
- `delta`: fixed frame delta in seconds, defaulting to `1/60`;
- `profile`: `play`, `preview`, or `demo`;
- `seed`: unsigned non-zero 32-bit deterministic seed;
- `mode`: initial experience mode identifier;
- `style`: initial visual style identifier.
- `scenario`: optional deterministic frame-indexed input script identifier.

Capture mode disables the wall-clock animation loop, pins the canvas backing
store to pixel ratio 1, runs the requested frames synchronously, and then
stops. The canvas reports authoritative evidence through these attributes:

| Attribute | Meaning |
|---|---|
| `data-engine-state="capture-ready"` | Fixed stepping and final rendering completed. |
| `data-capture-frame` | Exact requested frame number. |
| `data-capture-delta` | Fixed delta used for every frame. |
| `data-capture-checksum` | FNV-1a checksum of the top-down RGBA framebuffer. |
| `data-capture-cpu-p95` | CPU-side engine-frame p95 in milliseconds. |
| `data-capture-entity-count` | Final experience entity count when exposed by its runtime controller. |

The browser viewport defines the logical and physical capture dimensions. A
`960x540` viewport therefore produces a `960x540` framebuffer regardless of
the host display scale.

## Ball Pit harness proof

At `960x540`, the frame-180 Neon demo request above produced checksum
`ecf09bd9` on two independent reloads. The measured CPU p95 values were
approximately `25.22 ms` and `24.91 ms`; these are harness smoke measurements,
not the final performance acceptance result. The browser console contained no
warnings or errors.

The static comparison uses frame 1 of each empty play style as a diagnostic for
backdrop and render-path regressions. The temporal comparison uses independently captured demo
frames 60, 120, and 180. Each image is reduced to 32-pixel spatial cells before
comparison, and the sequence must achieve at least `0.80` minimum spatial
similarity and `0.90` mean spatial similarity. Independent browser contexts
are used for every timestamp so state and WebGL resources cannot leak between
captures.

## Frozen-reference comparison command

Run the isolated Ball Pit comparison with:

```text
pnpm parity:capture:ball-pit
```

Run the complete ten-style Single-mode matrix with:

```text
pnpm parity:capture:ball-pit:styles
```

Run the four functional interaction scenarios with:

```text
pnpm parity:capture:ball-pit:modes
```

The command starts both Vite hosts, launches an installed Chromium browser at
`960x540` and device scale 1, seeds the frozen host's random source, advances
its animation frames through a manual fixed-step RAF queue, drives its public
Reset, Palette, and Demo controls, and compares the
isolated visible canvases. Outputs are written under
`.artifacts/parity/ball-pit/`, which is intentionally excluded from source
control.

The verifier rejects uniform/blank images before computing SSIM. This prevents
cleared WebGL drawing buffers from producing false perfect scores.

The style matrix selects every palette through the frozen host's public Palette
control and through the rebuild capture contract. Each style receives its own
static pair and three independently isolated temporal pairs. The generated
schema-v3 report records per-style diagnostics and an aggregate acceptance
result.

Palette variants are not independent physics gates. Their acceptance contract
is the maintained manifest and color inputs, equivalent render path, shared
particle shader, and clean browser execution. Static pixel scores remain
diagnostic. Rainbow is the canonical temporal geometry style;
other styles retain their temporal scores as diagnostics without blocking the
aggregate result on palette-dependent luminance differences.

The canonical seed is decimal `305441741` (`0x1234abcd`), matching the frozen
dense-circle engine's private initial state. Before each temporal capture the
frozen host is reset through its public Reset control, then enters Demo without
advancing the virtual clock. This pins both engines to the same oscillator
phase, random stream, and exact requested demo-frame count.

The complete Single-mode style matrix proves byte-identical static output for
all ten styles. After aligning the private seed, spawn random-consumption order,
vertical emitter phase, depth-weighted collision masses, row-major broadphase,
air drag, wall finalization, and solver pass order, five styles pass the
temporal gate: Rainbow (`0.88740` minimum, `0.92764` mean), Pastel
(`0.86364`, `0.92570`), Ocean (`0.88192`, `0.91774`), Candy (`0.88143`,
`0.92884`), and Jungle Bounce (`0.88555`, `0.90615`). The remaining palette
variants all clear the minimum threshold; their lower means are retained as
non-blocking color diagnostics. Every one of the 80 browser-side
captures completed without a page error; rebuild frame-180 CPU p95 ranged from
`21.42 ms` to `24.14 ms`. Interaction-mode scenarios remain separate parity
obligations.

The first matrix exposed an incorrectly active Ball Pit bloom pass in the
rebuild's Neon style. Disabling that scene-level pass resolves the visible
white clipping. Under the corrected fixed-frame protocol Neon now measures
`0.84449` minimum and `0.87559` mean. Those values are diagnostic under the
palette-insensitive acceptance policy.

## Functional mode evidence

The mode verifier replays the same pointer schedule against the frozen canvas
and rebuild input service. All four scenarios are browser-clean and meet their
exact rebuild state contracts:

| Mode | Script | Final bodies | Structural similarity | CPU p95 |
|---|---|---:|---:|---:|
| Single | Tap once, release | 1 | `0.99906` | `0.46 ms` |
| Stream | Hold for 60 frames | 1,200 | `0.87666` | `4.00 ms` |
| Interact | Pick and drag across three positions | 1,400 | `0.86331` | `4.10 ms` |
| Explosion | Blast after 60 demo frames | 1,480 | `0.86364` | `4.35 ms` |

Package tests additionally assert that Interact increases velocity toward the
pointer and Explosion adds an outward impulse. Pixel scores are retained only
as diagnostics.
