# Ball Pit parity audit

Frozen behavior reference: `1273b5f4145c5e9e87123cba535f5cc939a77a61`.

| Contract | State | Evidence or remaining gate |
|---|---|---|
| Identity and registry | Implemented | Registry test covers id, kind, copy, tags, icon, and capabilities. |
| Settings schema | Implemented | All 17 fields, defaults, ranges, steps, advanced flags, mode visibility, and power-of-two scaling are covered by package tests. |
| Modes | Implemented | Single, Stream, Interact, and Explosion route through the shared runtime controller. |
| Styles | Partial | Ten frozen manifests, palettes, and backgrounds are implemented. The Neon bloom pass still needs the shared post-processing pipeline. |
| Tutorial | Implemented | Three frozen pages render through the shared tutorial host. |
| Reset | Implemented | Physics state, deterministic seed, pointer picks, and spawn timing reset together. |
| Normal play | Implemented | Starts empty and responds to deterministic pointer input. |
| Preview | Partial | Uses the frozen reduced physics profile and deterministic 14-per-second automatic spawn. A formal capture is still required. |
| Demo | Partial | Deterministic automatic spawn is implemented. The timed falling-floor cycle is not yet implemented. |
| AI autoplay | Not applicable | Frozen capability is disabled. |
| Rendering scale | Pending | Current native instanced sprites are correct for the CPU physics slice; the GPU-resident high-count path is required for the 65,536 default budget. |
| Static visual tolerance | Pending | Requires approved reference and rebuild captures with SSIM at or above `0.97`. |
| Dynamic visual tolerance | Pending | Requires deterministic frame-sequence comparison for every mode and style. |
| Performance budget | Pending | Requires equivalent CPU/GPU p95 captures and no more than ten percent regression. |

The experience ledger must remain `pending` until every pending and partial row
above has authoritative capture or benchmark evidence.
