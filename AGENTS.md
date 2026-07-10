# AGENTS.md — GLGameLab

## Project identity

GLGameLab is a code-first, GPU-first TypeScript game engine for the web. The
engine kernel is platform-independent; browser, renderer, physics, tooling,
and content packages depend on its public contracts.

## Non-negotiable rules

1. Use `pnpm` only.
2. Keep TypeScript strict. Do not use `any` or unexplained suppression comments.
3. Core cannot import DOM, React, WebGL, audio, storage, or concrete physics APIs.
4. Games and simulations use public engine contracts, never renderer internals.
5. A running experience owns one canvas, one GPU context, and one engine frame loop.
6. GPU resources must have explicit owners and deterministic cleanup.
7. Structural ECS changes are command-buffered during scheduled execution.
8. New serialized components require stable type IDs, schema versions, and migrations.
9. Preserve deterministic seeds and fixed-step behavior in tests.
10. Do not commit legacy product names, package names, storage keys, or DOM attributes.

## Commit discipline

Use Conventional Commits with these scopes:

- `repo`, `architecture`, `reference`
- `core`, `ecs`, `scene`, `assets`
- `web`, `audio`, `render`, `gpu`
- `physics`, `animation`, `tools`, `react`
- `games`, `sims`, `demo`, `parity`, `ci`, `release`

Each commit must represent one reviewable contract or one vertical experience
slice. Avoid `WIP`, `misc`, `checkpoint`, and broad cleanup commits. Before
committing, run focused tests, the affected package typecheck, and
`git diff --check`. Commit bodies for parity work must record the frozen
reference revision, parity cases, and validation evidence.
