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

## Frozen-reference comparison command

Run the isolated Ball Pit comparison with:

```text
pnpm parity:capture:ball-pit
```

The command starts both Vite hosts, launches an installed Chromium browser at
`960x540` and device scale 1, seeds the frozen host's random source, advances
its browser clock virtually, drives its public Demo control, and compares the
isolated visible canvases. Outputs are written under
`.artifacts/parity/ball-pit/`, which is intentionally excluded from source
control.

The verifier rejects uniform/blank images before computing SSIM. This prevents
cleared WebGL drawing buffers from producing false perfect scores.

The first valid frame-180 Rainbow comparison scored `0.14656` SSIM with mean
absolute luminance error `0.18322`. Both browser error lists were empty. The
failure is expected evidence: the frozen scene currently has a palette-driven
side-view backdrop, larger shaded spheres, and a different occupied-pixel
distribution. Those gaps must be closed before the visual gate can pass.

After moving the frozen side-view palette backdrop and sphere/rim lighting into
shared renderer passes, the same capture improved to `0.18752` SSIM and reduced
mean absolute luminance error to `0.15857`. The remaining dominant mismatch is
the per-particle spatial distribution, which requires a scene-specific dynamic
sequence metric rather than treating independently solved particle coordinates
as a static pixel image.
