# Ball Pit parity audit

Frozen behavior reference: `1273b5f4145c5e9e87123cba535f5cc939a77a61`.

| Contract | State | Evidence or remaining gate |
|---|---|---|
| Identity and registry | Implemented | Registry test covers id, kind, copy, tags, icon, and capabilities. |
| Settings schema | Implemented | All 17 fields, defaults, ranges, steps, advanced flags, mode visibility, and power-of-two scaling are covered by package tests. |
| Modes | Implemented | Single, Stream, Interact, and Explosion route through the shared runtime controller. |
| Styles | Implemented | Ten frozen manifests, palettes, and backgrounds are implemented. Ball Pit preserves the frozen raw-scene output without applying post-processing; the shared bloom pipeline remains available to experiences whose reference rendering uses it. |
| Tutorial | Implemented | Three frozen pages render through the shared tutorial host. |
| Reset | Implemented | Physics state, deterministic seed, pointer picks, and spawn timing reset together. |
| Normal play | Implemented | Starts empty and responds to deterministic pointer input. |
| Shared runtime host | Implemented | Browser QA confirmed engine `running`, empty normal play, four mode controls, ten-style selection, mode-filtered settings, power-of-two display, tutorial dialog, point-shader spawn, live Neon bloom switching, and no console warnings or errors. |
| Preview | Partial | Uses the frozen reduced physics profile and deterministic 14-per-second automatic spawn. The fixed-step capture route is ready; the equivalent frozen-reference comparison is still required. |
| Demo | Partial | Deterministic automatic spawn preserves the frozen 1,200-per-second rate, timed falling-floor cycle, and escaped-particle pruning. Rainbow and Candy pass the frozen three-frame Single-mode temporal gate; eight styles and the interaction modes still require alignment and capture. |
| AI autoplay | Not applicable | Frozen capability is disabled. |
| Rendering scale | Partial | Typed-array uniform-grid physics and the dedicated GPU point renderer now avoid per-particle objects. The 65,536 default budget still requires formal p95 evidence and any resulting tuning. |
| Static visual tolerance | Implemented | All ten empty play-style captures are byte-identical at frame 1: SSIM `1.0`, zero error, and matching per-style SHA-256 hashes. |
| Dynamic visual tolerance | Partial | The ten-style Single-mode matrix captures frames 60, 120, and 180 in isolated contexts. Rainbow and Candy pass the declared minimum `0.80` and mean `0.90` spatial gate. The other eight styles fail one or both thresholds and remain alignment work; interaction modes are not yet certified. |
| Performance budget | Partial | An equivalent synthetic 65,536-body zero-collision CPU sample measured `52.59 ms` p95 versus `155.15 ms` for the frozen solver. Formal browser CPU/GPU p95 captures under representative collisions are still required. |

The experience ledger must remain `pending` until every pending and partial row
above has authoritative capture or benchmark evidence.

The reproducible browser protocol and current rebuild-side evidence are recorded
in [capture-protocol.md](./capture-protocol.md).

## Current benchmark note

The synthetic comparison used 65,536 radius-4 bodies distributed on a
256-by-256 grid, gravity disabled, three solver passes, two substeps, and eight
timed frames after population. The rebuild reduced sampled p95 solver time by
approximately 66 percent. This is useful architectural evidence, but it is not
the acceptance benchmark because it excludes browser rendering and sustained
collision pressure.
