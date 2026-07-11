import { useState } from 'react';
import { ExperienceRuntime } from '@hooksjam/gl-game-lab-react';
import { ballPitDefinition } from '@hooksjam/gl-game-lab-games';
import { alienVascularTreeDefinition, chainRainDefinition, fireworksDefinition, fluidTankDefinition, harmonicSandDefinition, myceliumDefinition, orbitalShrapnelDefinition, particleFluidDefinition, softBodyBlobDefinition, sparksDefinition, turingSkinDefinition } from '@hooksjam/gl-game-lab-simulations';
import './index.css';
import { parseDemoCaptureOptions } from './captureOptions.js';
import { ballPitCaptureInputEvents } from './ballPitCaptureScenarios.js';

export function App(): JSX.Element {
  const [runtimeError, setRuntimeError] = useState<string>();
  const capture = parseDemoCaptureOptions(window.location.search);
  const experienceId = new URLSearchParams(window.location.search).get('experience');
  const experience = experienceId === 'harmonic-sand'
    ? harmonicSandDefinition
    : experienceId === 'fireworks' ? fireworksDefinition
      : experienceId === 'sparks' ? sparksDefinition
        : experienceId === 'orbital-shrapnel' ? orbitalShrapnelDefinition
          : experienceId === 'turing-skin' ? turingSkinDefinition
            : experienceId === 'mycelium' ? myceliumDefinition
              : experienceId === 'alien-vascular-tree' ? alienVascularTreeDefinition
                : experienceId === 'chain-rain' ? chainRainDefinition
                  : experienceId === 'soft-body-blob' ? softBodyBlobDefinition
                    : experienceId === 'fluid-tank' ? fluidTankDefinition
                      : experienceId === 'particle-fluid' ? particleFluidDefinition : ballPitDefinition;
  return (
    <main className={capture.enabled ? 'shell capture-shell' : 'shell'}>
      {!capture.enabled && (
        <section className="intro">
          <p className="eyebrow">GPU-first experience</p>
          <h1>{experience.name}</h1>
          <p>{experience.long}</p>
        </section>
      )}
      <ExperienceRuntime
        definition={experience}
        profile={capture.enabled ? capture.profile : 'play'}
        {...(capture.enabled ? { seed: capture.seed } : {})}
        {...(capture.enabled && capture.modeId ? { initialModeId: capture.modeId } : {})}
        {...(capture.enabled && capture.styleId ? { initialStyleId: capture.styleId } : {})}
        showChrome={!capture.enabled}
        onError={(error) => { setRuntimeError(error instanceof Error ? error.message : String(error)); }}
        {...(capture.enabled ? { fixedFrameCapture: {
          frameNumber: capture.frameNumber,
          fixedDeltaSeconds: capture.fixedDeltaSeconds,
          inputEvents: experience.id === 'ball-pit' ? ballPitCaptureInputEvents(capture.scenarioId) : [],
        } } : {})}
        className="surface"
        canvasClassName="game-canvas"
      />
      {runtimeError && <p className="runtime-error" role="alert">Engine error: {runtimeError}</p>}
    </main>
  );
}
