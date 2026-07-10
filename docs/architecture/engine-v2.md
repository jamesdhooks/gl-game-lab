# GLGameLab engine architecture

## Purpose

GLGameLab is a code-first, GPU-first game engine. Rendering is one engine
module rather than the engine itself. The complete architecture includes a
portable kernel, hierarchical ECS worlds, plugins, assets, scenes, input,
physics, audio, animation, serialization, accessibility, tooling, and a
unified GPU renderer.

The first shipping host is the browser. The kernel must remain usable in
headless tests without DOM, WebGL, React, Web Audio, or browser storage.

## Dependency layers

```text
games and simulations
        |
engine authoring facade
        |
scenes, prefabs, gameplay systems
        |
world: ECS, hierarchy, events, resources
        |
kernel: schedules, time, plugins, serialization
        |
+-----------------------+-----------------------+
| platform services     | render services       |
| input/audio/storage   | extraction/graph/GPU  |
+-----------------------+-----------------------+
```

Dependencies point downward only. Core owns contracts and deterministic state;
platform and renderer packages implement those contracts. Content cannot
import renderer internals.

## Composition root and plugins

`Engine` is the composition root. An `EnginePlugin` may register:

- components, resources, systems, and schedule stages;
- asset loaders and importers;
- serialized schemas and migrations;
- render extraction systems and passes;
- input actions and bindings;
- inspectors, debug views, and profiler panels;
- explicit dependencies on other plugins.

Registration uses stable IDs and rejects incompatible or duplicate providers.
Feature packages extend the engine through plugins rather than edits to a
central loop or feature switch.

## World model

The world uses generational entity IDs and sparse-set component storage.
Structural changes are deferred through a command buffer while schedules run.
Typed queries declare component access so later worker scheduling can identify
safe parallel work.

Hierarchy is expressed through components. The canonical transform is
three-dimensional, while ergonomic two-dimensional helpers expose position,
rotation, scale, anchors, and layer ordering for common games.

High-count particles, fields, fluids, and constraints remain specialized
data-oriented resources. They are not represented as one ECS entity per GPU
element.

## Schedule

The standard schedule is:

1. `startup`
2. `preFixed`
3. `fixedUpdate`
4. `postFixed`
5. `preUpdate`
6. `update`
7. `postUpdate`
8. `renderExtract`
9. `renderPrepare`
10. `render`
11. `postRender`
12. `shutdown`

Time services provide fixed and variable deltas, pause, time scaling, multiple
clocks, deterministic seeds, preview budgets, capture, and replay.

## Scenes, prefabs, and serialization

Scenes support additive loading, transitions, nested prefabs, variants,
property overrides, runtime-only entities, and stable cross-entity references.
Serialized components have stable type IDs and schema versions. Migration is
mandatory whenever a stored schema changes.

Save-game snapshots are separate from complete scene serialization so games can
persist intentional state without serializing renderer or transient resources.

## Rendering

One engine instance owns one canvas, one WebGL2 context, and one frame loop.
Gameplay state is extracted into a render-only world before GPU work begins.

The render graph owns pass order, dependencies, render targets, transient
resources, resize propagation, and deterministic cleanup. Gameplay systems do
not mutate WebGL state directly.

The first native renderer provides sprites, texture atlases, frame animation,
cameras, viewports, instanced shapes, sorting, culling, blend modes, masks,
in-world text, render-to-texture, materials, and shader parameters.

GPU features participate in the same graph: particles, trails, fields, fluids,
metaballs, constraints, sparse geometry, lighting, shadows, bloom, distortion,
color grading, and compositing. Dense GPU-authoritative state stays resident on
the GPU; recurring full-state uploads and readbacks are prohibited.

## Three-dimensional foundation

The initial contracts include three-dimensional transforms, orthographic and
perspective cameras, geometry, vertex layouts, meshes, materials, textures,
samplers, lights, depth targets, culling, and render queues. The full mesh/PBR
renderer is a later plugin and cannot be required by the two-dimensional path.

## Tooling and accessibility

Code is authoritative. Tools include an entity inspector, scene tree,
component editor, asset view, render-graph viewer, physics debug draw,
CPU/GPU profiler, frame capture, and deterministic replay.

Interactive world entities can publish semantic descriptions to a DOM mirror
for keyboard navigation and screen readers. Reduced motion, contrast, captions,
and input remapping are engine-level capabilities rather than content-specific
afterthoughts.
