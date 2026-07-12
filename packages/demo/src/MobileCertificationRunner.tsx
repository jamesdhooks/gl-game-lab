import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExperienceRuntime, type FixedFrameCaptureResult } from '@hooksjam/gl-game-lab-react';
import type { ExperienceDefinition, GameEngine } from '@hooksjam/gl-game-lab-engine';
import { loadDemoCatalog } from './experienceLoader.js';
import {
  captureDeviceIdentity,
  createMobileCertificationReport,
  mobileCertificationError,
  summarizeMobileCapture,
  type MobileCertificationDevice,
  type MobileCertificationEntry,
} from './mobileCertification.js';

const MOBILE_CAPTURE = Object.freeze({ frameNumber: 120, fixedDeltaSeconds: 1 / 30 });

export function MobileCertificationRunner(): JSX.Element {
  const [catalog, setCatalog] = useState<readonly ExperienceDefinition[]>([]);
  const [status, setStatus] = useState<'loading' | 'idle' | 'running' | 'complete'>('loading');
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<readonly MobileCertificationEntry[]>([]);
  const [device, setDevice] = useState<MobileCertificationDevice>();
  const [completedAt, setCompletedAt] = useState<string>();
  const [copyStatus, setCopyStatus] = useState('');
  const engineRef = useRef<GameEngine>();
  const completingRef = useRef(false);

  useEffect(() => {
    let active = true;
    void loadDemoCatalog().then((definitions) => {
      if (!active) return;
      setCatalog(definitions);
      setStatus('idle');
    }).catch(() => {
      if (active) setStatus('idle');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (status !== 'running' || index < catalog.length) return;
    setCompletedAt(new Date().toISOString());
    setStatus('complete');
  }, [catalog.length, index, status]);

  const current = status === 'running' ? catalog[index] : undefined;
  const report = useMemo(() => completedAt && device
    ? createMobileCertificationReport(completedAt, device, results)
    : undefined, [completedAt, device, results]);
  const reportJson = useMemo(() => report ? `${JSON.stringify(report, null, 2)}\n` : '', [report]);

  const start = (): void => {
    setDevice(captureDeviceIdentity());
    setResults([]);
    setIndex(0);
    setCompletedAt(undefined);
    setCopyStatus('');
    completingRef.current = false;
    setStatus('running');
  };

  const finish = useCallback(async (entryFactory: (cleanupError?: string) => MobileCertificationEntry): Promise<void> => {
    if (completingRef.current) return;
    completingRef.current = true;
    await Promise.resolve();
    let cleanupError: string | undefined;
    try {
      await engineRef.current?.destroy();
    } catch (error) {
      cleanupError = error instanceof Error ? error.message : String(error);
    }
    engineRef.current = undefined;
    setResults((previous) => Object.freeze([...previous, entryFactory(cleanupError)]));
    window.setTimeout(() => {
      completingRef.current = false;
      setIndex((value) => value + 1);
    }, 100);
  }, []);

  const handleCapture = useCallback((result: FixedFrameCaptureResult): void => {
    if (!current) return;
    void finish((cleanupError) => summarizeMobileCapture(current, result, cleanupError));
  }, [current, finish]);

  const handleError = useCallback((error: unknown): void => {
    if (!current) return;
    void finish((cleanupError) => {
      const entry = mobileCertificationError(current, error);
      if (!cleanupError) return entry;
      return Object.freeze({ ...entry, failures: Object.freeze([...entry.failures, `Engine cleanup: ${cleanupError}`]) });
    });
  }, [current, finish]);

  const download = (): void => {
    if (!reportJson) return;
    const url = URL.createObjectURL(new Blob([reportJson], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `gl-game-lab-mobile-${report?.generatedAt.slice(0, 10) ?? 'report'}.json`;
    anchor.click();
    window.setTimeout(() => { URL.revokeObjectURL(url); }, 0);
  };

  const copy = (): void => {
    if (!navigator.clipboard) {
      setCopyStatus('Clipboard unavailable — select the report below');
      return;
    }
    void navigator.clipboard.writeText(reportJson).then(() => { setCopyStatus('Copied'); }).catch(() => { setCopyStatus('Copy failed — select the report below'); });
  };

  return (
    <main
      className="min-h-screen bg-[#080810] px-4 py-6 text-slate-100 sm:px-8"
      data-mobile-certification-status={status}
      data-mobile-certification-results={results.length}
      data-mobile-certification-passed={report?.passed}
    >
      <section className="mx-auto max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300">Physical device gate</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">Mobile certification</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Run all 15 recommended profiles on this device. Keep this tab visible, disable low-power mode, close other heavy apps, and do not rotate the screen during the run.</p>

        {status === 'loading' && <p className="mt-8" role="status">Loading release catalog…</p>}
        {status === 'idle' && (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-300">This will run 120 deterministic frames per experience at the engine's 30 FPS mobile tier. It may take several minutes.</p>
            <button type="button" onClick={start} disabled={catalog.length !== 15} className="mt-5 rounded-xl bg-cyan-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-40">Start 15-experience run</button>
            {catalog.length !== 15 && <p className="mt-3 text-sm text-amber-300">Expected 15 release experiences; loaded {catalog.length}.</p>}
          </div>
        )}

        {status === 'running' && current && (
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between text-sm"><strong>{index + 1} / {catalog.length}: {current.name}</strong><span className="text-cyan-300">Running…</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-cyan-400 transition-[width]" style={{ width: `${(index / catalog.length) * 100}%` }} /></div>
            <div className="mt-4 h-[52vh] min-h-64 overflow-hidden rounded-2xl border border-white/10 bg-black">
              <ExperienceRuntime
                key={current.id}
                definition={current}
                profile="demo"
                seed={5_366_110}
                showChrome={false}
                fixedFrameCapture={MOBILE_CAPTURE}
                onReady={(engine) => { engineRef.current = engine; }}
                onFixedFrameCapture={handleCapture}
                onError={handleError}
                className="h-full w-full"
                canvasClassName="game-canvas"
              />
            </div>
          </div>
        )}

        <div className="mt-6 space-y-2" aria-label="Mobile certification results">
          {results.map((result) => (
            <div key={result.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
              <div><strong>{result.name}</strong>{result.failures.length > 0 && <p className="mt-1 text-xs text-rose-300">{result.failures.join('; ')}</p>}</div>
              <div className="text-right"><span className={result.status === 'passed' ? 'text-emerald-300' : 'text-rose-300'}>{result.status.toUpperCase()}</span>{result.cpuP95Milliseconds !== undefined && <div className="text-xs text-slate-400">p95 {result.cpuP95Milliseconds.toFixed(2)} ms</div>}</div>
            </div>
          ))}
        </div>

        {status === 'complete' && report && (
          <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className={`text-2xl font-bold ${report.passed ? 'text-emerald-300' : 'text-rose-300'}`}>{report.passed ? 'Physical mobile gate passed' : 'Physical mobile gate failed'}</h2>
            <p className="mt-2 text-sm text-slate-300">Save this report and provide it for the release audit. Run once on iOS Safari and once on Android Chrome.</p>
            {report.violations.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-rose-300">{report.violations.map((violation) => <li key={violation}>{violation}</li>)}</ul>}
            <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={download} className="rounded-xl bg-cyan-400 px-4 py-2 font-bold text-slate-950">Download JSON</button><button type="button" onClick={copy} className="rounded-xl border border-white/20 px-4 py-2 font-bold">Copy JSON</button><button type="button" onClick={start} className="rounded-xl border border-white/20 px-4 py-2 font-bold">Run again</button></div>
            {copyStatus && <p className="mt-2 text-xs text-slate-400" role="status">{copyStatus}</p>}
            <textarea readOnly value={reportJson} aria-label="Mobile certification JSON" className="mt-5 h-56 w-full rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-[10px] text-slate-300" />
          </section>
        )}
      </section>
    </main>
  );
}
