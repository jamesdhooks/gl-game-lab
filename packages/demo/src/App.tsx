import { useCallback, useRef, useState } from 'react';
import { ExperienceRuntime } from '@hooksjam/gl-game-lab-react';
import type { ExperienceDefinition, GameEngine } from '@hooksjam/gl-game-lab-engine';
import { ballPitDefinition, referenceArenaDefinition } from '@hooksjam/gl-game-lab-games';
import { WebGL2RendererService, type ContextCycleDiagnostics } from '@hooksjam/gl-game-lab-render-webgl2';
import { alienVascularTreeDefinition, chainRainDefinition, fireworksDefinition, fluidTankDefinition, harmonicSandDefinition, lavaLampDefinition, myceliumDefinition, orbitalShrapnelDefinition, particleFluidDefinition, softBodyBlobDefinition, sparksDefinition, splashMpmDefinition, turingSkinDefinition, waterTankDefinition } from '@hooksjam/gl-game-lab-simulations';
import './index.css';
import { parseDemoCaptureOptions } from './captureOptions.js';
import { ballPitCaptureInputEvents } from './ballPitCaptureScenarios.js';

export function App(): JSX.Element {
  const [runtimeError, setRuntimeError] = useState<string>();
  const [diagnosticStatus, setDiagnosticStatus] = useState('idle');
  const [contextResult, setContextResult] = useState<ContextCycleDiagnostics>();
  const [lifecycleAlternate, setLifecycleAlternate] = useState(false);
  const engineRef = useRef<GameEngine>();
  const previousEngineRef = useRef<GameEngine>();
  const readyCountRef = useRef(0);
  const capture = parseDemoCaptureOptions(window.location.search);
  const query = new URLSearchParams(window.location.search);
  const experienceId = query.get('experience');
  const showDiagnostics = query.get('diagnostics') === '1';
  const contextTest = query.get('contextTest') === '1';
  const lifecycleTest = query.get('lifecycleTest') === '1';
  const selectedExperience: ExperienceDefinition = experienceId === 'reference-arena' ? referenceArenaDefinition
    : experienceId === 'harmonic-sand'
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
                      : experienceId === 'particle-fluid' ? particleFluidDefinition
                        : experienceId === 'lava-lamp' ? lavaLampDefinition
                          : experienceId === 'water-tank' ? waterTankDefinition
                            : experienceId === 'splash-mpm' ? splashMpmDefinition : ballPitDefinition;
  const experience = lifecycleAlternate ? (selectedExperience.id === 'reference-arena' ? ballPitDefinition : referenceArenaDefinition) : selectedExperience;
  const handleReady = useCallback((engine: GameEngine): void => {
    previousEngineRef.current = engineRef.current;
    engineRef.current = engine;
    readyCountRef.current += 1;
    if (readyCountRef.current > 1) {
      window.setTimeout(() => {
        const previous = previousEngineRef.current;
        setDiagnosticStatus(previous?.state === 'destroyed' ? 'lifecycle-passed' : `lifecycle-failed:${previous?.state ?? 'missing'}`);
      }, 100);
    }
  }, []);
  const cycleContext = async (): Promise<void> => {
    const engine = engineRef.current;
    if (!engine) return;
    setDiagnosticStatus('context-cycling');
    try {
      const result = await engine.kernel.get(WebGL2RendererService).cycleContextForDiagnostics();
      setContextResult(result);
      const stable = result.generationAfter > result.generationBefore
        && result.resourcesAfter === result.resourcesBefore
        && result.bytesAfter === result.bytesBefore;
      setDiagnosticStatus(stable ? 'context-passed' : 'context-failed');
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setDiagnosticStatus('context-error');
    }
  };
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
        key={experience.id}
        definition={experience}
        profile={capture.enabled ? capture.profile : 'play'}
        {...(capture.enabled ? { seed: capture.seed } : {})}
        {...(capture.enabled && capture.modeId ? { initialModeId: capture.modeId } : {})}
        {...(capture.enabled && capture.styleId ? { initialStyleId: capture.styleId } : {})}
        showChrome={!capture.enabled}
        showDiagnostics={showDiagnostics}
        onReady={handleReady}
        onError={(error) => { setRuntimeError(error instanceof Error ? error.message : String(error)); }}
        {...(capture.enabled ? { fixedFrameCapture: {
          frameNumber: capture.frameNumber,
          fixedDeltaSeconds: capture.fixedDeltaSeconds,
          inputEvents: experience.id === 'ball-pit' ? ballPitCaptureInputEvents(capture.scenarioId) : [],
        } } : {})}
        className="surface"
        canvasClassName="game-canvas"
      />
      {(contextTest || lifecycleTest) && (
        <aside
          className="diagnostic-controls"
          aria-label="Engine diagnostic controls"
          data-diagnostic-status={diagnosticStatus}
          data-ready-count={readyCountRef.current}
          data-context-generation-before={contextResult?.generationBefore}
          data-context-generation-after={contextResult?.generationAfter}
          data-context-resources-before={contextResult?.resourcesBefore}
          data-context-resources-after={contextResult?.resourcesAfter}
          data-context-bytes-before={contextResult?.bytesBefore}
          data-context-bytes-after={contextResult?.bytesAfter}
        >
          {contextTest && <button type="button" onClick={() => { void cycleContext(); }}>Cycle GPU context</button>}
          {lifecycleTest && <button type="button" onClick={() => { setDiagnosticStatus('lifecycle-cycling'); setLifecycleAlternate((value) => !value); }}>Replace experience</button>}
          <output aria-live="polite">{diagnosticStatus}</output>
        </aside>
      )}
      {runtimeError && <p className="runtime-error" role="alert">Engine error: {runtimeError}</p>}
    </main>
  );
}
