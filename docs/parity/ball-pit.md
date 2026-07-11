# Ball Pit parity audit

Frozen behavior reference: `1273b5f4145c5e9e87123cba535f5cc939a77a61`.

| Contract | State | Evidence or remaining gate |
|---|---|---|
| Identity and registry | Implemented | Registry test covers id, kind, copy, tags, icon, and capabilities. |
| Settings schema | Implemented | All 17 fields, defaults, ranges, steps, advanced flags, mode visibility, and power-of-two scaling are covered by package tests. |
| Modes | Implemented | Single, Stream, Interact, and Explosion route through the shared runtime controller. Fixed-step browser scenarios prove exact final counts and clean execution; package tests prove drag and blast impulses. |
| Styles | Implemented | Ten frozen manifests, palettes, and backgrounds are implemented. Ball Pit preserves the frozen raw-scene output without applying post-processing; the shared bloom pipeline remains available to experiences whose reference rendering uses it. |
| Tutorial | Implemented | Three frozen pages render through the shared tutorial host. |
| Reset | Implemented | Physics state, deterministic seed, pointer picks, and spawn timing reset together. |
| Normal play | Implemented | Starts empty and responds to deterministic pointer input. |
| Shared runtime host | Implemented | Browser QA confirmed engine `running`, empty normal play, four mode controls, ten-style selection, mode-filtered settings, power-of-two display, tutorial dialog, point-shader spawn, and no console warnings or errors. |
| Preview | Partial | Uses the frozen reduced physics profile and deterministic 14-per-second automatic spawn. The fixed-step capture route is ready; the equivalent frozen-reference comparison is still required. |
| Demo | Partial | Deterministic automatic spawn preserves the frozen 1,200-per-second rate, timed falling-floor cycle, and escaped-particle pruning. Canonical Rainbow geometry passes the frozen three-frame Single-mode temporal gate; interaction modes still require scenario captures. |
| AI autoplay | Not applicable | Frozen capability is disabled. |
| Rendering scale | Partial | Typed-array uniform-grid physics and the dedicated GPU point renderer now avoid per-particle objects. The 65,536 default budget still requires formal p95 evidence and any resulting tuning. |
| Static visual structure | Implemented | All ten maintained palettes/backgrounds use the shared backdrop path; the empty play captures also happen to be byte-identical, though pixel identity is diagnostic rather than required. |
| Dynamic visual structure | Implemented | The ten-style matrix captures exact RAF frames 60, 120, and 180; canonical Rainbow geometry passes at `0.88740` minimum and `0.92764` mean. All palette variants share maintained inputs/render methods and are browser-clean. Single, Stream, Interact, and Explosion scenarios score at least `0.86331` structural similarity. |
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
