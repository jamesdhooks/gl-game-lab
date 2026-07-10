# Package boundaries

## Planned packages

| Package | Responsibility |
|---|---|
| `core` | ECS, schedules, math, events, scenes, serialization, plugin contracts |
| `engine` | Stable composition and game-authoring facade |
| `platform-web` | Browser host, input, storage, workers, and audio integration |
| `render-webgl2` | GPU device, resources, render graph, native 2D renderer |
| `physics-2d` | Rigid-body adapter and custom particle physics implementations |
| `tools` | Inspectors, profiling, capture, replay, and debug views |
| `react` | Application shell and DOM-based game UI bridge |
| `games` | Game content using public engine APIs |
| `simulations` | Simulation content using public engine APIs |
| `demo` | Development gallery, parity host, and documentation examples |

## Enforcement

- `core` has no runtime dependencies on another workspace package.
- Renderer and platform implementations depend on `core`, never the reverse.
- `engine` composes implementations without leaking them into core contracts.
- Content imports the authoring facade and explicitly public feature packages.
- No content package imports `WebGL2RenderingContext` or renderer-private files.
- Debug and editor tools observe through registered adapters and snapshots.
- Package export maps expose intentional entry points; source-relative imports
  across package boundaries are forbidden.

These rules will be enforced by package tests and import-boundary checks before
experience migration begins.
