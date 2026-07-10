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

Static and dynamic parity remain pending until equivalent frozen-reference
captures are collected and the committed comparison report satisfies the
required SSIM and temporal tolerances.
