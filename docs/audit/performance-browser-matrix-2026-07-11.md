# Browser performance matrix — 2026-07-11

Production bundle retested after lifecycle remediation in Chromium/WebGL2 using
180 deterministic desktop frames and 120 deterministic mobile frames per
experience. Desktop used a 1280×720 viewport and a 16.67 ms budget. Mobile used a
390×844 viewport and a 33.34 ms budget. The accepted rerun used isolated port 5196
to prevent a pre-existing dev server from contaminating evidence. Mobile results
are viewport emulation on desktop hardware; physical iOS/Android acceptance remains
a separate release gate.

All 30 tier/experience captures reached `capture-ready`, emitted no runtime error,
and passed the engine CPU/draw/upload/resource envelope.

## Desktop (60 FPS target)

| Experience | CPU p95 ms | Draws | Upload/frame | GPU bytes |
|---|---:|---:|---:|---:|
| Ball Pit | 9.31 | 2 | 57,600 | 8,448 |
| Harmonic Sand | 0.20 | 1 | 0 | 8,448 |
| Fireworks | 0.30 | 4 | 0 | 9,445,632 |
| Sparks | 0.30 | 6 | 0 | 4,202,752 |
| Space Debris | 0.30 | 5 | 0 | 2,367,744 |
| Turing Skin | 0.20 | 3 | 0 | 155,904 |
| Mycelium | 0.20 | 3 | 0 | 155,904 |
| Alien Vascular Tree | 0.30 | 4 | 3,696 | 8,448 |
| Chain Rain | 0.60 | 4 | 9,024 | 8,448 |
| Soft Body Blob | 1.71 | 4 | 31,616 | 8,448 |
| Fluid Tank | 0.40 | 36 | 0 | 7,173,888 |
| Particle Fluid | 0.21 | 2 | 0 | 20,472,064 |
| Lava Lamp | 0.41 | 7 | 480 | 5,538,048 |
| Water Tank | 4.90 | 3 | 32,912 | 8,448 |
| Splash PIC/FLIP | 1.70 | 9 | 126,488 | 5,538,048 |

## Mobile viewport (30 FPS target)

| Experience | CPU p95 ms | Draws | Upload/frame | GPU bytes |
|---|---:|---:|---:|---:|
| Ball Pit | 1.40 | 2 | 15,360 | 8,448 |
| Harmonic Sand | 0.20 | 1 | 0 | 8,448 |
| Fireworks | 0.40 | 4 | 0 | 9,445,632 |
| Sparks | 0.31 | 5 | 0 | 4,202,752 |
| Space Debris | 0.41 | 5 | 0 | 2,367,744 |
| Turing Skin | 0.30 | 4 | 0 | 575,744 |
| Mycelium | 0.30 | 4 | 0 | 575,744 |
| Alien Vascular Tree | 0.31 | 4 | 4,944 | 8,448 |
| Chain Rain | 1.00 | 4 | 9,024 | 8,448 |
| Soft Body Blob | 1.71 | 4 | 35,568 | 8,448 |
| Fluid Tank | 0.40 | 36 | 0 | 8,267,760 |
| Particle Fluid | 0.30 | 2 | 0 | 18,115,328 |
| Lava Lamp | 0.61 | 7 | 528 | 1,983,408 |
| Water Tank | 7.40 | 3 | 32,912 | 8,448 |
| Splash PIC/FLIP | 1.71 | 9 | 54,744 | 1,983,408 |

## Defects found during the matrix

- Chain Rain and Soft Body Blob initially failed because their supported wide bloom
  kernels exceeded an overly restrictive renderer validation cap. The cap now
  supports the shader's 0.25–16 range and both scenes pass.
- Ball Pit initially measured about 230 ms p95 in the mobile envelope. The engine now
  publishes a host-controlled adaptive quality tier; the mobile recommendation caps
  particle count/emission and reduces solver work without altering desktop defaults
  or the explicit stress-setting range. The current isolated rerun is 1.40 ms p95.
- Splash PIC/FLIP initially reported roughly 2.1 MiB/frame because diagnostics
  charged entire capacity-sized typed arrays even though the renderers uploaded
  active subarrays. Active-count accounting now matches the real transfer: 126,488
  bytes desktop and 54,744 bytes mobile at the later deterministic capture frames.

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
