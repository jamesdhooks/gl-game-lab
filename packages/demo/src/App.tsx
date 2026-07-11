import { useCallback, useEffect, useRef, useState } from 'react';
import { ExperienceRuntime } from '@hooksjam/gl-game-lab-react';
import type { ExperienceDefinition, GameEngine } from '@hooksjam/gl-game-lab-engine';
import { WebGL2RendererService, type ContextCycleDiagnostics } from '@hooksjam/gl-game-lab-render-webgl2';
import './index.css';
import { parseDemoCaptureOptions } from './captureOptions.js';
import { ballPitCaptureInputEvents } from './ballPitCaptureScenarios.js';
import { loadDemoExperience, loadLifecycleAlternate } from './experienceLoader.js';

export function App(): JSX.Element {
  const [runtimeError, setRuntimeError] = useState<string>();
  const [diagnosticStatus, setDiagnosticStatus] = useState('idle');
  const [contextResult, setContextResult] = useState<ContextCycleDiagnostics>();
  const [lifecycleAlternate, setLifecycleAlternate] = useState(false);
  const [selectedExperience, setSelectedExperience] = useState<ExperienceDefinition>();
  const [alternateExperience, setAlternateExperience] = useState<ExperienceDefinition>();
  const [inputPointers, setInputPointers] = useState(0);
  const [inputGamepads, setInputGamepads] = useState(0);
  const [inputKeys, setInputKeys] = useState(0);
  const engineRef = useRef<GameEngine>();
  const previousEngineRef = useRef<GameEngine>();
  const readyCountRef = useRef(0);
  const inputObservedRef = useRef({ pointerEvents: 0, gamepads: 0, keys: 0 });
  const capture = parseDemoCaptureOptions(window.location.search);
  const query = new URLSearchParams(window.location.search);
  const experienceId = query.get('experience');
  const showDiagnostics = query.get('diagnostics') === '1';
  const contextTest = query.get('contextTest') === '1';
  const lifecycleTest = query.get('lifecycleTest') === '1';
  const inputTest = query.get('inputTest') === '1';
  useEffect(() => {
    let active = true;
    setSelectedExperience(undefined);
    setAlternateExperience(undefined);
    setLifecycleAlternate(false);
    void loadDemoExperience(experienceId).then((definition) => {
      if (active) setSelectedExperience(definition);
    }).catch((error: unknown) => {
      if (active) setRuntimeError(error instanceof Error ? error.message : String(error));
    });
    return () => { active = false; };
  }, [experienceId]);
  const experience = lifecycleAlternate && alternateExperience ? alternateExperience : selectedExperience;
  const handleReady = useCallback((engine: GameEngine): void => {
    previousEngineRef.current = engineRef.current;
    engineRef.current = engine;
    readyCountRef.current += 1;
    if (inputTest) {
      inputObservedRef.current = { pointerEvents: 0, gamepads: 0, keys: 0 };
      engine.schedule.addSystem({
        id: 'gl-game-lab.demo.input-probe',
        stage: 'postUpdate',
        run: () => {
          const snapshot = engine.input.snapshot;
          inputObservedRef.current.pointerEvents += snapshot.events.filter((event) => event.kind === 'pointer').length;
          inputObservedRef.current.gamepads = Math.max(inputObservedRef.current.gamepads, snapshot.gamepads.length);
          inputObservedRef.current.keys = Math.max(inputObservedRef.current.keys, snapshot.keysDown.length);
        },
      });
    }
    if (readyCountRef.current > 1) {
      window.setTimeout(() => {
        const previous = previousEngineRef.current;
        setDiagnosticStatus(previous?.state === 'destroyed' ? 'lifecycle-passed' : `lifecycle-failed:${previous?.state ?? 'missing'}`);
      }, 100);
    }
  }, [inputTest]);
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
  const reportInput = (): void => {
    const snapshot = engineRef.current?.input.snapshot;
    setInputPointers(inputObservedRef.current.pointerEvents);
    setInputGamepads(Math.max(inputObservedRef.current.gamepads, snapshot?.gamepads.length ?? 0));
    setInputKeys(Math.max(inputObservedRef.current.keys, snapshot?.keysDown.length ?? 0));
    setDiagnosticStatus('input-reported');
  };
  const replaceExperience = async (): Promise<void> => {
    if (!selectedExperience) return;
    setDiagnosticStatus('lifecycle-cycling');
    if (!alternateExperience) {
      try {
        const alternate = await loadLifecycleAlternate(selectedExperience.id);
        setAlternateExperience(alternate);
        setLifecycleAlternate(true);
      } catch (error) {
        setRuntimeError(error instanceof Error ? error.message : String(error));
        setDiagnosticStatus('lifecycle-error');
      }
      return;
    }
    setLifecycleAlternate((value) => !value);
  };
  if (!experience) {
    return <main className="shell"><p role="status">Loading GLGameLab experience…</p>{runtimeError && <p className="runtime-error" role="alert">Engine error: {runtimeError}</p>}</main>;
  }
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
      {(contextTest || lifecycleTest || inputTest) && (
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
          data-input-pointers={inputPointers}
          data-input-pointer-events={inputPointers}
          data-input-gamepads={inputGamepads}
          data-input-keys={inputKeys}
        >
          {contextTest && <button type="button" onClick={() => { void cycleContext(); }}>Cycle GPU context</button>}
          {lifecycleTest && <button type="button" onClick={() => { void replaceExperience(); }}>Replace experience</button>}
          {inputTest && <button type="button" onClick={reportInput}>Report input state</button>}
          <output aria-live="polite">{diagnosticStatus}</output>
        </aside>
      )}
      {runtimeError && <p className="runtime-error" role="alert">Engine error: {runtimeError}</p>}
    </main>
  );
}
