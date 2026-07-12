# Physical mobile certification

The production mobile gate must run on real iOS/iPadOS Safari and Android Chrome.
Desktop viewport emulation, touch emulation, alternate iOS browsers, Android
WebViews, and desktop touchscreens cannot produce a passing report.

## Run the gate

Open this URL directly on the device:

<https://jamesdhooks.github.io/gl-game-lab/?mobileCertification=1>

Before starting:

1. Update the browser, close other heavy tabs/apps, and disable low-power mode.
2. Keep the device unplugged only if that is the normal thermal target; record the
   chosen condition with the report.
3. Keep the tab foregrounded and do not rotate or lock the device during the run.
4. Tap **Start 15-experience run** and wait for the final verdict.

The runner loads one experience at a time, executes 120 deterministic frames at
the recommended 30 FPS demo profile, applies the engine's mobile CPU/draw/upload/
GPU-memory budgets, destroys the engine, and only then advances. This avoids
accumulating WebGL contexts on constrained browsers.

## Acceptance

A report is acceptable only when:

- `device.target` is `ios-safari` or `android-chrome`;
- exactly 15 distinct release experience IDs are present;
- every result is `passed` and includes CPU p95, draws, uploads, GPU bytes, and a
  framebuffer checksum;
- the top-level `violations` array is empty and `passed` is `true`;
- no browser reload, tab backgrounding, thermal warning, or visible rendering
  failure occurred during the run.

Use **Download JSON** or **Copy JSON** and retain the unedited report. If download
or clipboard access is unavailable, the complete JSON remains selectable in the
report text area. Run once on a representative modern iPhone/iPad and once on a
representative modern Android phone. A failure opens a targeted tuning/remediation
pass; it is not averaged away or waived.

Desktop automation exercises the complete orchestration and intentionally ends
with `Certification must run on physical iOS/iPadOS Safari or Android Chrome`, so
local success cannot be mistaken for physical-device evidence.
