# Browser release gate

The hosted browser matrix is defined in `.github/workflows/browser-release.yml`.
It runs independently for Chromium, Firefox, and WebKit so a crash or timeout in
one engine does not hide evidence from the others.

Each job performs a frozen install, installs the selected Playwright browser,
builds the production workspace, serves the production demo, and runs:

```bash
pnpm browser:release -- --browser=chromium
pnpm browser:release -- --browser=firefox
pnpm browser:release -- --browser=webkit
```

The gate verifies:

- the public demo shell exposes exactly 15 live experience cards, one game and
  fourteen simulations through the expected category filters;
- Ball Pit opens through the original immersive launcher composition with its
  centered intro card, HUD, icon controls, floating tuning panel, complete settings
  drawer, info-card recall, and dockable left/bottom/right experience picker;
- a 390×844 touch viewport exposes the original mobile style/mode header and
  adaptive overflow sheet with reset, settings, hide-UI, demo, and info actions;
- Reference Arena reaches the running state through the public runtime contract;
- its score is present in an ARIA live region;
- real browser touch down/up events reach the engine input snapshot;
- a deterministic standard-mapped gamepad is polled through `navigator.getGamepads`;
- same-host Reference Arena to Ball Pit replacement destroys the previous engine;
- deterministic context-resource invalidation and reconstruction advances the
  generation, preserves tracked resource counts/bytes, and returns the canvas to
  a running page without errors in each hosted browser.

Every job uploads `.artifacts/browser-release/report-<browser>.json`, including
individual failures. A missing extension, page crash, timeout, resource mismatch,
or page exception fails the job; it is never converted to a skip.

Viewport touch emulation does not replace physical iOS/Android performance signoff.
Those results remain a separate production-cutover gate.

Hosted Linux software renderers suspend page execution after
`WEBGL_lose_context.loseContext()`, including under Xvfb, so CI records the
explicit `registry` strategy rather than claiming a driver restoration it cannot
perform. The real `driver` strategy remains available through
`cycleContextForDiagnostics()` for physical-browser GPU signoff.

An installed hardware-backed browser build can be selected with
`GL_GAME_LAB_BROWSER_EXECUTABLE`; set `GL_GAME_LAB_BROWSER_HEADLESS=false` and
`GL_GAME_LAB_CONTEXT_STRATEGY=driver`. The machine-readable report records those
launch choices and the actual browser version so physical evidence cannot be
confused with the hosted registry strategy. See
`docs/architecture/development-workflows.md` for the exact PowerShell invocation.

The 2026-07-11 physical-host matrix passes installed Chrome 150, installed Edge
150, and headed Firefox 151. See `physical-driver-matrix-2026-07-11.md` for the
captured generation/resource invariants and defects found during certification.
