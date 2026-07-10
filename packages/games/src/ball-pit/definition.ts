import type { ExperienceDefinition, ExperienceTutorialPage } from '@hooksjam/gl-game-lab-engine';
import { createDenseCircleParticlePlugin } from '@hooksjam/gl-game-lab-physics-2d';
import { createBallPitPlugin } from './BallPitPlugin.js';
import { BALL_PIT_DEFAULTS, BALL_PIT_SETTINGS, ballPitConfigForProfile, createBallPitConfig } from './config.js';
import { BALL_PIT_STYLE_MANIFEST } from './styles.js';

export const BALL_PIT_TUTORIAL_PAGES: readonly ExperienceTutorialPage[] = Object.freeze([
  { icon: '👆', title: 'Tap to Spawn', body: 'Tap anywhere on screen to drop a colourful bouncy ball.' },
  { icon: '✋', title: 'Interact Mode', body: 'Switch to Interact, press near a cluster, and drag the picked balls with your pointer.' },
  { icon: '🧲', title: 'Stream Or Blast', body: 'Stream pours balls while held. Explosion blasts nearby balls outward with a tap.' },
]);

export const ballPitDefinition: ExperienceDefinition = {
  id: 'ball-pit',
  kind: 'simulation',
  name: 'Ball Pit',
  short: 'Drop bouncy balls and push them around the pit.',
  long: 'Fill the screen with bouncy balls and stir them around.',
  icon: '🔴',
  tags: ['physics', 'simulation', 'raw-webgl', 'advanced-engine'],
  paletteHint: 'rainbow',
  capabilities: {
    interactive: true,
    reset: true,
    demo: true,
    tutorial: true,
    settings: true,
    score: false,
    aiAutoplay: false,
    screensaver: false,
    qualityModes: ['raw'],
  },
  configDefaults: { ...BALL_PIT_DEFAULTS },
  modes: [
    { id: 'single', label: 'Single', icon: '•', description: 'Tap to drop one ball.' },
    { id: 'stream', label: 'Stream', icon: '⋯', description: 'Hold to pour balls into the pit.' },
    { id: 'interact', label: 'Interact', icon: '✋', description: 'Drag balls around.' },
    { id: 'explosion', label: 'Explosion', icon: '◎', description: 'Tap to blast nearby balls outward.' },
  ],
  settings: BALL_PIT_SETTINGS,
  styleManifest: BALL_PIT_STYLE_MANIFEST,
  tutorialPages: BALL_PIT_TUTORIAL_PAGES,
  physics: {
    renderer: 'webgl2',
    engine: 'advanced-circle-particles',
    portability: 'reusable-core',
    supportedShapes: ['circle'],
    reusableFor: ['falling circle piles', 'dense collision benchmarks', 'force-field interaction demos'],
    caveats: ['Ball Pit intentionally stays circle-only; other collision shapes belong in separate purpose-built demos.'],
  },
  createPlugins: (options = {}) => {
    const config = createBallPitConfig(options.settings);
    const effectiveConfig = ballPitConfigForProfile(config, options.profile);
    return [
      createDenseCircleParticlePlugin({
        capacity: options.profile === 'preview' ? 256 : 262_144,
        ...(options.seed !== undefined ? { seed: options.seed } : {}),
        settings: {
          maxParticles: effectiveConfig.maxParticles,
          radius: effectiveConfig.radius,
          radiusVariation: effectiveConfig.radiusVariation,
          gravity: effectiveConfig.gravity,
          solverIterations: effectiveConfig.solverPasses,
          substeps: effectiveConfig.substeps,
          wallBounce: effectiveConfig.wallBounce,
          boundaryRestitution: effectiveConfig.wallBounceAmount,
          airDrag: effectiveConfig.airDrag,
          solverDamping: effectiveConfig.solverDamping,
          collisionSoftness: effectiveConfig.collisionSoftness,
          maxPairPush: effectiveConfig.maxPairPush,
          impactBounceThreshold: effectiveConfig.impactBounceThreshold,
          contactFriction: effectiveConfig.friction,
          openTop: true,
        },
      }),
      createBallPitPlugin(config, options),
    ];
  },
};
