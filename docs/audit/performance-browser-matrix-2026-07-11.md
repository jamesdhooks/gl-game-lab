# Browser performance matrix — 2026-07-11

Production bundle tested in Chromium/WebGL2 using 120 deterministic demo frames per
experience. Desktop used a 1280×720 viewport and a 16.67 ms budget. Mobile used a
390×844 viewport and a 33.34 ms budget. Mobile results are viewport emulation on
desktop hardware; physical iOS/Android acceptance remains a separate release gate.

All 30 tier/experience captures reached `capture-ready`, emitted no runtime error,
and passed the engine CPU/draw/upload/resource envelope.

## Desktop (60 FPS target)

| Experience | CPU p95 ms | Draws | Upload/frame | GPU bytes |
|---|---:|---:|---:|---:|
| Ball Pit | 9.00 | 2 | 38,400 | 8,448 |
| Harmonic Sand | 0.61 | 1 | 0 | 8,448 |
| Fireworks | 0.50 | 4 | 0 | 9,445,632 |
| Sparks | 0.91 | 6 | 0 | 4,202,752 |
| Space Debris | 0.61 | 5 | 0 | 2,367,744 |
| Turing Skin | 0.90 | 3 | 0 | 155,904 |
| Mycelium | 0.81 | 3 | 0 | 155,904 |
| Alien Vascular Tree | 0.71 | 4 | 2,496 | 8,448 |
| Chain Rain | 1.62 | 4 | 7,472 | 8,448 |
| Soft Body Blob | 3.10 | 4 | 27,664 | 8,448 |
| Fluid Tank | 0.80 | 37 | 0 | 7,179,648 |
| Particle Fluid | 0.60 | 25 | 0 | 20,472,064 |
| Lava Lamp | 0.90 | 7 | 16,384 | 5,543,808 |
| Water Tank | 7.80 | 3 | 131,216 | 8,448 |
| Splash PIC/FLIP | 3.31 | 9 | 124,568 | 5,543,808 |

## Mobile viewport (30 FPS target)

| Experience | CPU p95 ms | Draws | Upload/frame | GPU bytes |
|---|---:|---:|---:|---:|
| Ball Pit | 2.10 | 2 | 15,360 | 8,448 |
| Harmonic Sand | 0.51 | 1 | 0 | 8,448 |
| Fireworks | 0.70 | 4 | 0 | 9,445,632 |
| Sparks | 0.84 | 5 | 0 | 4,202,752 |
| Space Debris | 0.41 | 5 | 0 | 2,367,744 |
| Turing Skin | 0.40 | 4 | 0 | 575,744 |
| Mycelium | 0.50 | 4 | 0 | 575,744 |
| Alien Vascular Tree | 0.71 | 4 | 4,944 | 8,448 |
| Chain Rain | 1.80 | 4 | 9,024 | 8,448 |
| Soft Body Blob | 3.00 | 4 | 35,568 | 8,448 |
| Fluid Tank | 0.71 | 37 | 0 | 8,264,012 |
| Particle Fluid | 0.81 | 25 | 0 | 18,115,328 |
| Lava Lamp | 1.02 | 7 | 16,384 | 1,993,292 |
| Water Tank | 11.70 | 3 | 131,216 | 8,448 |
| Splash PIC/FLIP | 2.90 | 9 | 132,248 | 1,993,292 |

## Defects found during the matrix

- Chain Rain and Soft Body Blob initially failed because their supported wide bloom
  kernels exceeded an overly restrictive renderer validation cap. The cap now
  supports the shader's 0.25–16 range and both scenes pass.
- Ball Pit initially measured about 230 ms p95 in the mobile envelope. The engine now
  publishes a host-controlled adaptive quality tier; the mobile recommendation caps
  particle count/emission and reduces solver work without altering desktop defaults
  or the explicit stress-setting range. The repaired result is 2.10 ms p95.
- Splash PIC/FLIP initially reported roughly 2.1 MiB/frame because diagnostics
  charged entire capacity-sized typed arrays even though the renderers uploaded
  active subarrays. Active-count accounting now matches the real transfer: 124,568
  bytes desktop and 132,248 bytes mobile in fresh production captures.

## Functional browser evidence

- Reference Arena booted in the production bundle, rendered through the public 2D
  path, and exposed both its visible score and ARIA live score announcement.
- A same-mount definition replacement changed Reference Arena to Ball Pit. The
  replacement reached `running`; the previous engine reached `destroyed`; the
  diagnostics probe reported `lifecycle-passed`.
- The hosted Chromium, Firefox, and WebKit release matrix passed accessibility,
  touch, gamepad, lifecycle replacement, and deterministic context-resource
  invalidation/rebuild. Each report records `strategy: registry` and proves that
  generation advances while tracked resource counts and bytes remain stable.
- Real `WEBGL_lose_context` remains a physical-browser gate. Hosted Linux software
  drivers suspended page execution after forced loss in both headless and Xvfb
  modes, so those attempts are not misrepresented as driver restoration proof.
