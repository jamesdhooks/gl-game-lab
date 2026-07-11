# Development workflows

## Schema-backed world inspection

Construct `WorldInspector` with the engine world, hierarchy, and schema registry.
Its snapshots expose only registered serializable components. Component edits
must use `setComponent`; the production decoder validates data and applies schema
migrations before the world is mutated. Unknown component IDs and invalid entity
references fail without inserting a component. Tooling must not inspect private
ECS storage.

## Asset reload

Development hosts may call `AssetManager.reload` only for a ready asset with no
active leases. The manager releases the previous value, returns the record to the
unloaded state, and performs a normal dependency-aware request. A reload never
mutates a leased resource in place. Production hosts should publish new manifest
versions instead of relying on development reload.

## Save compatibility

Every persisted component has a stable type ID and positive schema version.
Changing its stored representation requires a contiguous migration chain and a
fixture proving an older document restores to the current value. Save snapshots
use their own versioned codec and are intentionally separate from complete scene
serialization.

## Diagnostics-only browser probes

The demo accepts explicit query flags for release verification. `contextTest=1`
exposes forced WebGL context loss/restoration and resource-equivalence output;
`lifecycleTest=1` replaces an experience inside one React host and reports whether
the previous engine reached its terminal destroyed state. `experience=reference-arena`
opens the internal conventional-2D vertical slice without adding it to the public
experience registry. These controls are demo-only and are not public runtime API.

## Shader diagnostics

Content-provided fullscreen, field, simulation, and particle shaders compile via
`createShaderProgram`. Callers provide a stable label. Compilation failures include
the label, shader stage, driver log, and numbered source; successful links retain
active uniform and attribute reflection for tooling through
`shaderProgramReflection`. Required built-in uniforms use `requireShaderUniform`
instead of silently accepting inactive locations. Context restoration recompiles
the same retained sources through this path.

## Backend render extensions

WebGL2 renderer plugins may resolve `WebGL2FramePipelineService` and register a
stable pass before or after any built-in frame stage. Registration validates IDs,
stage names, and integer ordering; ties sort by ID for deterministic builds. The
returned disposer is idempotent and rebuilds the compiled graph without the pass.
Gameplay and portable experience plugins must continue to submit through
backend-neutral sprite, effect, and GPU services instead of this backend hook.
