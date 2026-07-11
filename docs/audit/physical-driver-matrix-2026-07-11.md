# Physical desktop driver-loss matrix — 2026-07-11

The release gate ran in headed mode on the Windows host's physical browser/GPU
stack with `GL_GAME_LAB_CONTEXT_STRATEGY=driver`. Unlike hosted CI's explicit
registry strategy, these runs invoked `WEBGL_lose_context.loseContext()` and
`restoreContext()` and waited for real lost/restored browser events.

## Results

| Browser | Build | Gate scope | Generation | Resources | GPU bytes | Result |
|---|---:|---|---:|---:|---:|---|
| Installed Google Chrome | 150.0.7871.102 | Full shell, platform, lifecycle, context | 0 → 1 | 6 → 6 | 9,280 → 9,280 | Pass |
| Installed Microsoft Edge | 150.0.4078.65 | Full shell, platform, lifecycle, context | 0 → 1 | 6 → 6 | 9,280 → 9,280 | Pass |
| Playwright Firefox on the physical Windows host | 151.0 | Context | 0 → 1 | 6 → 6 | 9,280 → 9,280 | Pass |

Firefox's context-only scope isolates driver certification from a headed Windows
click-automation stall. The complete Firefox shell/platform matrix separately
passes in hosted CI. System Firefox cannot expose Playwright's required Juggler
protocol, so the Playwright Firefox build is the supported automated executable.

## Defects found and remediated

1. `restoreContext()` originally ran from an `await` microtask immediately after
   the lost-event listener. The Khronos extension contract says restoration is
   invalid until the event has fully completed. The request now crosses a browser
   task boundary before asking the driver to restore.
2. Once the browser emitted `webglcontextrestored`, `WebGL2Device` still marked
   itself lost while invoking resource restorers. The renderer pipeline therefore
   rejected its own `resize()` call. The device now becomes usable before resource
   reconstruction and returns to a guarded lost state if reconstruction fails.
3. Recovery aggregation obscured the failing resource. Registry failures now
   retain resource IDs and nested causes, and the browser report captures the
   diagnostic error.

The added device regression test proves a registered restorer can call normal
device APIs during the restored event and that generation advances only after
successful reconstruction.
