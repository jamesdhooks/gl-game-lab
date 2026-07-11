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

- Reference Arena reaches the running state through the public runtime contract;
- its score is present in an ARIA live region;
- real browser touch down/up events reach the engine input snapshot;
- a deterministic standard-mapped gamepad is polled through `navigator.getGamepads`;
- same-host Reference Arena to Ball Pit replacement destroys the previous engine;
- forced `WEBGL_lose_context` recovery advances the generation, preserves tracked
  resource counts/bytes, and returns the canvas to a running page without errors.

Every job uploads `.artifacts/browser-release/report-<browser>.json`, including
individual failures. A missing extension, page crash, timeout, resource mismatch,
or page exception fails the job; it is never converted to a skip.

Viewport touch emulation does not replace physical iOS/Android performance signoff.
Those results remain a separate production-cutover gate.
