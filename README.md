# GLGameLab

GLGameLab is a code-first, GPU-first TypeScript game engine for building games,
interactive simulations, and mixed 2D/GPU experiences in the browser.

The engine is being developed around a portable kernel, an extensible plugin
model, deterministic schedules, hierarchical ECS worlds, a unified WebGL2
render graph, and first-class developer tooling.

## Workspace

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

The rebuild is intentionally incremental. Every engine subsystem and migrated
experience is committed as a separately validated slice.
