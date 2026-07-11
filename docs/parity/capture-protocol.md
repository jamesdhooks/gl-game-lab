# Deterministic browser capture protocol

The demo host exposes a canvas-only fixed-step route for repeatable visual and
performance evidence:

```text
/?capture=1&frame=180&profile=demo&seed=7&mode=single&style=neon
```

Supported parameters are:

- `frame`: exact number of fixed frames to execute, from 1 through 10,000;
- `delta`: fixed frame delta in seconds, defaulting to `1/60`;
- `profile`: `play`, `preview`, or `demo`;
- `seed`: unsigned non-zero 32-bit deterministic seed;
- `mode`: initial experience mode identifier;
- `style`: initial visual style identifier.

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

The browser viewport defines the logical and physical capture dimensions. A
`960x540` viewport therefore produces a `960x540` framebuffer regardless of
the host display scale.

## Ball Pit harness proof

At `960x540`, the frame-180 Neon demo request above produced checksum
`ecf09bd9` on two independent reloads. The measured CPU p95 values were
approximately `25.22 ms` and `24.91 ms`; these are harness smoke measurements,
not the final performance acceptance result. The browser console contained no
warnings or errors.

The strict static comparison uses frame 1 of the empty Rainbow play scene and
requires `0.97` SSIM. The temporal comparison uses independently captured demo
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

The command starts both Vite hosts, launches an installed Chromium browser at
`960x540` and device scale 1, seeds the frozen host's random source, advances
its browser clock virtually, drives its public Demo control, and compares the
isolated visible canvases. Outputs are written under
`.artifacts/parity/ball-pit/`, which is intentionally excluded from source
control.

The verifier rejects uniform/blank images before computing SSIM. This prevents
cleared WebGL drawing buffers from producing false perfect scores.

The style matrix selects every palette through the frozen host's public Palette
control and through the rebuild capture contract. Each style receives its own
static pair and three independently isolated temporal pairs. The generated
schema-v2 report records per-style gates as well as an aggregate pass result.

The empty Rainbow play captures are byte-identical: SSIM `1.0`, zero mean
absolute error, and matching SHA-256 hashes. With the frozen spawn position,
velocity, color hash, and per-pass collision relaxation preserved, the demo
sequence scores `0.82751`, `0.94885`, and `0.94932` spatial similarity at frames
60, 120, and 180. The minimum is `0.82751` and the mean is `0.90856`, satisfying
the declared temporal gate without increasing the frozen `1200/sec` spawn
rate. All reference and rebuild browser error lists are empty.

The complete Single-mode style matrix proves byte-identical static output for
all ten styles. Rainbow (`0.82714` minimum, `0.90921` mean) and Candy
(`0.81195` minimum, `0.90619` mean) pass the temporal gate. Pastel, Neon,
Ocean, Rubber Room, Soda Pop, Moon Gym, Jungle Bounce, and Monochrome Pop remain
below one or both temporal thresholds. Every one of the 80 browser-side
captures completed without a page error. Interaction-mode scenarios remain a
separate parity obligation.
