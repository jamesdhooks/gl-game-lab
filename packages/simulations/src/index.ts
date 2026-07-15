import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { harmonicSandDefinition } from './harmonic-sand/definition.js';
import { fireworksDefinition } from './fireworks/definition.js';
import { sparksDefinition } from './sparks/definition.js';
import { orbitalShrapnelDefinition } from './orbital-shrapnel/definition.js';
import { turingSkinDefinition } from './turing-skin/definition.js';
import { myceliumDefinition } from './mycelium/definition.js';
import { alienVascularTreeDefinition } from './alien-vascular-tree/definition.js';
import { chainRainDefinition } from './chain-rain/definition.js';
import { softBodyBlobDefinition } from './soft-body-blob/definition.js';
import { fluidTankDefinition } from './fluid-tank/definition.js';
import { particleFluidDefinition } from './particle-fluid/definition.js';
import { lavaLampDefinition } from './lava-lamp/definition.js';
import { waterTankDefinition } from './water-tank/definition.js';
import { splashMpmDefinition } from './splash-mpm/definition.js';

export { harmonicSandDefinition } from './harmonic-sand/definition.js';
export { fireworksDefinition } from './fireworks/definition.js';
export { sparksDefinition } from './sparks/definition.js';
export { orbitalShrapnelDefinition } from './orbital-shrapnel/definition.js';
export { turingSkinDefinition } from './turing-skin/definition.js';
export { myceliumDefinition } from './mycelium/definition.js';
export { alienVascularTreeDefinition } from './alien-vascular-tree/definition.js';
export { chainRainDefinition } from './chain-rain/definition.js';
export { CHAIN_RAIN_DEFAULTS, CHAIN_RAIN_SETTINGS, createChainRainConfig, chainNumber, chainString, type ChainRainConfig } from './chain-rain/config.js';
export { CHAIN_RAIN_PLUGIN_ID, ChainRainControllerService, createChainRainPlugin, type ChainRainController, type ChainRainMode } from './chain-rain/ChainRainPlugin.js';
export { CHAIN_RAIN_STYLE_MANIFEST } from './chain-rain/styles.js';
export { softBodyBlobDefinition } from './soft-body-blob/definition.js';
export { SOFT_BODY_BLOB_DEFAULTS, SOFT_BODY_BLOB_SETTINGS, createSoftBodyBlobConfig, blobNumber, blobString, type SoftBodyBlobConfig } from './soft-body-blob/config.js';
export { SOFT_BODY_BLOB_PLUGIN_ID, SoftBodyBlobControllerService, createSoftBodyBlobPlugin, type SoftBodyBlobController, type SoftBodyBlobMode } from './soft-body-blob/SoftBodyBlobPlugin.js';
export { SOFT_BODY_BLOB_STYLE_MANIFEST } from './soft-body-blob/styles.js';
export { SoftBodyModel, prepareSoftBodyDrawBlueprint, type SoftBody, type SoftBodyDrawBlueprint, type SoftBodyPoint, type SoftBodyTuning } from './soft-body-blob/SoftBodyModel.js';
export { fluidTankDefinition } from './fluid-tank/definition.js';
export { FLUID_TANK_DEFAULTS, FLUID_TANK_SETTINGS, createFluidTankConfig, fluidBoolean, fluidNumber, fluidString, type FluidTankConfig } from './fluid-tank/config.js';
export { FLUID_TANK_PLUGIN_ID, FluidTankControllerService, createFluidTankPlugin, velocityFromScreenDelta, type FluidTankController, type FluidTankMode } from './fluid-tank/FluidTankPlugin.js';
export { FLUID_TANK_STYLE_MANIFEST } from './fluid-tank/styles.js';
export { particleFluidDefinition } from './particle-fluid/definition.js';
export { PARTICLE_FLUID_DEFAULTS, PARTICLE_FLUID_SETTINGS, createParticleFluidConfig, particleFluidNumber, particleFluidString, type ParticleFluidConfig } from './particle-fluid/config.js';
export { PARTICLE_FLUID_PLUGIN_ID, ParticleFluidControllerService, createParticleFluidPlugin, type ParticleFluidController } from './particle-fluid/ParticleFluidPlugin.js';
export { PARTICLE_FLUID_STYLE_MANIFEST } from './particle-fluid/styles.js';
export { lavaLampDefinition } from './lava-lamp/definition.js';
export { LAVA_LAMP_DEFAULTS, LAVA_LAMP_SETTINGS, createLavaLampConfig, lavaNumber, lavaString, type LavaLampConfig } from './lava-lamp/config.js';
export { LAVA_LAMP_PLUGIN_ID, LavaLampControllerService, createLavaLampPlugin, type LavaLampController, type LavaLampMode } from './lava-lamp/LavaLampPlugin.js';
export { LAVA_LAMP_STYLE_MANIFEST } from './lava-lamp/styles.js';
export { LavaLampModel, type LavaLampTuning } from './lava-lamp/LavaLampModel.js';
export { waterTankDefinition } from './water-tank/definition.js';
export { WATER_TANK_DEFAULTS, WATER_TANK_SETTINGS, createWaterTankConfig, waterNumber, waterString, type WaterTankConfig } from './water-tank/config.js';
export { WATER_TANK_PLUGIN_ID, WaterTankControllerService, createWaterTankPlugin, type WaterTankController, type WaterTankMode } from './water-tank/WaterTankPlugin.js';
export { WATER_TANK_STYLE_MANIFEST } from './water-tank/styles.js';
export { WaterTankModel, type WaterObstacle, type WaterTankTuning } from './water-tank/WaterTankModel.js';
export { splashMpmDefinition } from './splash-mpm/definition.js';
export { SPLASH_MPM_DEFAULTS, SPLASH_MPM_SETTINGS, createSplashMpmConfig, splashNumber, splashString, type SplashMpmConfig } from './splash-mpm/config.js';
export { createSplashGpuPourBatch, resolveSplashPicFlipBackend, splashObstaclesToGpuArrays, splashSnapshotToGpuParticleGridSeed, splashSnapshotToGpuParticleGridStep, type SplashPicFlipBackendDecision, type SplashPicFlipBackendKind, type SplashPicFlipBackendOptions, type SplashPicFlipBackendRequest } from './splash-mpm/SplashPicFlipBackend.js';
export { validateSplashPicFlipGpuParity, type SplashPicFlipGpuParityResult } from './splash-mpm/SplashPicFlipGpuParity.js';
export { SPLASH_MPM_PLUGIN_ID, SplashMpmControllerService, createSplashMpmPlugin, type SplashMpmController, type SplashMpmMode } from './splash-mpm/SplashMpmPlugin.js';
export { SPLASH_MPM_STYLE_MANIFEST } from './splash-mpm/styles.js';
export { SPLASH_PIC_FLIP_CAPACITY, SplashPicFlipModel, SplashMpmModel, computeSplashPicFlipGridUpdate, computeSplashPicFlipParticleToGrid, computeSplashPicFlipParticleUpdate, type SplashMpmTuning, type SplashPicFlipGridUpdate, type SplashPicFlipGridUpdateInput, type SplashPicFlipGridUpdateOutput, type SplashPicFlipParticleToGridInput, type SplashPicFlipParticleToGridOutput, type SplashPicFlipParticleToGridTransfer, type SplashPicFlipParticleUpdate, type SplashPicFlipParticleUpdateInput } from './splash-mpm/SplashMpmModel.js';
export { VASCULAR_TREE_DEFAULTS, VASCULAR_TREE_SETTINGS, createVascularTreeConfig, type VascularTreeConfig } from './alien-vascular-tree/config.js';
export { VASCULAR_TREE_PLUGIN_ID, VascularTreeControllerService, createVascularTreePlugin, type VascularTreeController, type VascularTreeMode } from './alien-vascular-tree/VascularTreePlugin.js';
export { VASCULAR_TREE_STYLE_MANIFEST } from './alien-vascular-tree/styles.js';
export { VascularGrowthModel, type PackedVascularSegments, type VascularNode } from './alien-vascular-tree/VascularGrowthModel.js';
export { MYCELIUM_DEFAULTS, MYCELIUM_SETTINGS, createMyceliumConfig, myceliumNumber, myceliumString, type MyceliumConfig } from './mycelium/config.js';
export { MYCELIUM_PLUGIN_ID, MyceliumControllerService, createMyceliumPlugin, type MyceliumController } from './mycelium/MyceliumPlugin.js';
export { MYCELIUM_STYLE_MANIFEST } from './mycelium/styles.js';
export { TURING_SKIN_DEFAULTS, TURING_SKIN_SETTINGS, createTuringSkinConfig, type TuringSkinConfig } from './turing-skin/config.js';
export { TURING_SKIN_PLUGIN_ID, TuringSkinControllerService, createTuringSkinPlugin, type TuringSkinController, type TuringSkinMode } from './turing-skin/TuringSkinPlugin.js';
export { TURING_SKIN_STYLE_MANIFEST } from './turing-skin/styles.js';
export { ORBITAL_SHRAPNEL_DEFAULTS, ORBITAL_SHRAPNEL_SETTINGS, createOrbitalShrapnelConfig, orbitalBoolean, orbitalNumber, orbitalString, type OrbitalShrapnelConfig } from './orbital-shrapnel/config.js';
export { ORBITAL_SHRAPNEL_PLUGIN_ID, OrbitalShrapnelControllerService, createOrbitalShrapnelPlugin, type OrbitalShrapnelController, type OrbitalShrapnelMode } from './orbital-shrapnel/OrbitalShrapnelPlugin.js';
export { ORBITAL_SHRAPNEL_STYLE_MANIFEST } from './orbital-shrapnel/styles.js';
export { SPARKS_DEFAULTS, SPARKS_SETTINGS, createSparksConfig, sparksNumber, sparksString, type SparksConfig } from './sparks/config.js';
export { SPARKS_PLUGIN_ID, SparksControllerService, createSparksPlugin, type SparksController, type SparksMode } from './sparks/SparksPlugin.js';
export { SPARKS_STYLE_MANIFEST } from './sparks/styles.js';
export { FIREWORKS_DEFAULTS, FIREWORKS_SETTINGS, createFireworksConfig, type FireworksConfig } from './fireworks/config.js';
export { FIREWORKS_PLUGIN_ID, FireworksControllerService, createFireworksPlugin, type FireworksController, type FireworksMode } from './fireworks/FireworksPlugin.js';
export { FIREWORKS_STYLE_MANIFEST } from './fireworks/styles.js';
export {
  HARMONIC_SAND_DEFAULTS,
  HARMONIC_SAND_SETTINGS,
  createHarmonicSandConfig,
  type HarmonicRenderStyle,
  type HarmonicSandConfig,
} from './harmonic-sand/config.js';
export {
  HARMONIC_SAND_PLUGIN_ID,
  HarmonicSandControllerService,
  createHarmonicSandEmitterLayout,
  createHarmonicSandPlugin,
  harmonicSandEmitterMarkersVisible,
  type HarmonicSandController,
  type HarmonicSandEmitter,
} from './harmonic-sand/HarmonicSandPlugin.js';
export { HARMONIC_SAND_STYLE_MANIFEST } from './harmonic-sand/styles.js';

export const SIMULATION_REGISTRY = new ExperienceRegistry()
  .register(chainRainDefinition)
  .register(softBodyBlobDefinition)
  .register(harmonicSandDefinition)
  .register(myceliumDefinition)
  .register(orbitalShrapnelDefinition)
  .register(fluidTankDefinition)
  .register(particleFluidDefinition)
  .register(lavaLampDefinition)
  .register(waterTankDefinition)
  .register(splashMpmDefinition)
  .register(fireworksDefinition)
  .register(sparksDefinition)
  .register(turingSkinDefinition)
  .register(alienVascularTreeDefinition);
