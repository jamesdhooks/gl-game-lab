# Attribution

## Fluid simulation display pipeline

GLGameLab's stable-fluid solver and its bloom and sunray-style display stages adapt concepts from [WebGL Fluid Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) by Pavel Dobryakov, distributed under the MIT License.

The implementation is integrated into GLGameLab's renderer contracts, render-pass queue, field-state resources, and experience plugin system.

## Particle fluid experiments

GLGameLab's Particle Fluid experience is inspired by [GPU Fluid Experiments](https://github.com/haxiomic/GPU-Fluid-Experiments) by Haxiomic, distributed under GPL-3.0. The GLGameLab implementation composes its own shared GPU field, particle-state, simulation-pass, and rendering systems.

## Lava lamp ambience

GLGameLab's Lava Lamp experience is inspired by [WebGL Lava Lamp](https://github.com/brybrant/lava-lamp) by Matt Bryant, distributed under GPL-3.0. Its simulation and shaders are original GLGameLab implementations using shared thermal particles and density-surface rendering.

## Water particle relaxation

GLGameLab's Water Tank experience is inspired by [gl-water2d](https://github.com/Erkaman/gl-water2d) by Eric Arnebäck, distributed under the MIT License. GLGameLab provides its own spatial-hash relaxation model, buildable obstacles, engine settings, and GPU surface renderer.
