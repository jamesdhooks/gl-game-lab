import { ExperienceRuntime } from '@hooksjam/gl-game-lab-react';
import { ballPitDefinition } from '@hooksjam/gl-game-lab-games';
import './index.css';
import { parseDemoCaptureOptions } from './captureOptions.js';
import { ballPitCaptureInputEvents } from './ballPitCaptureScenarios.js';

export function App(): JSX.Element {
  const capture = parseDemoCaptureOptions(window.location.search);
  return (
    <main className={capture.enabled ? 'shell capture-shell' : 'shell'}>
      {!capture.enabled && (
        <section className="intro">
          <p className="eyebrow">First migrated experience</p>
          <h1>{ballPitDefinition.name}</h1>
          <p>{ballPitDefinition.long}</p>
        </section>
      )}
      <ExperienceRuntime
        definition={ballPitDefinition}
        profile={capture.enabled ? capture.profile : 'play'}
        {...(capture.enabled ? { seed: capture.seed } : {})}
        {...(capture.enabled && capture.modeId ? { initialModeId: capture.modeId } : {})}
        {...(capture.enabled && capture.styleId ? { initialStyleId: capture.styleId } : {})}
        showChrome={!capture.enabled}
        {...(capture.enabled ? { fixedFrameCapture: {
          frameNumber: capture.frameNumber,
          fixedDeltaSeconds: capture.fixedDeltaSeconds,
          inputEvents: ballPitCaptureInputEvents(capture.scenarioId),
        } } : {})}
        className="surface"
        canvasClassName="game-canvas"
      />
    </main>
  );
}
