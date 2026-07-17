import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bug, Pause, Play, RotateCcw, Shuffle, StepForward, X } from 'lucide-react';
import { EngineParticleEffects, ExperienceRuntimeControllerService, type EngineDiagnosticsSnapshot, type GameEngine } from '@hooksjam/gl-game-lab-engine';

export interface DebugPanelProps {
  readonly engine: GameEngine | undefined;
}

export function DebugPanel({ engine }: DebugPanelProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<EngineDiagnosticsSnapshot>();

  useEffect(() => {
    if (!engine) {
      setStats(undefined);
      setOpen(false);
      return undefined;
    }
    const update = (): void => { setStats(engine.diagnostics.snapshot()); };
    update();
    const interval = window.setInterval(update, 500);
    return () => { window.clearInterval(interval); };
  }, [engine]);

  const renderer = stats?.renderer;
  const runtimeDiagnostics = engine?.kernel.tryGet(ExperienceRuntimeControllerService)?.runtimeDiagnostics;
  const particleEffects = engine?.kernel.tryGet(EngineParticleEffects);
  const particleDiagnostics = particleEffects?.diagnostics();
  const particleInspection = particleEffects?.inspect();
  const uploads = (renderer?.bufferUploadBytes ?? 0) + (renderer?.textureUploadBytes ?? 0);
  const systems = [...(stats?.systems ?? [])].sort((left, right) => right.cpuMs - left.cpuMs);

  return (
    <div className="pointer-events-auto">
      <AnimatePresence mode="wait">
        {open ? (
          <motion.aside
            key="panel"
            initial={{ opacity: 0, scale: 0.92, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 6 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className="max-h-[70vh] w-[260px] overflow-y-auto rounded-2xl bg-black/80 p-4 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl"
            aria-label="Engine debug statistics"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Bug size={12} className="text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-white/50">Debug</span>
              </div>
              <button type="button" onClick={() => { setOpen(false); }} className="text-white/30 transition-colors hover:text-white" aria-label="Close debug panel"><X size={12} /></button>
            </div>
            <div className="space-y-1.5 font-mono text-xs">
              <StatRow label="fps" value={stats ? stats.fps.toFixed(0) : '—'} />
              <StatRow label="frame" value={stats ? `${stats.frameCpuMs.toFixed(2)} ms` : '—'} />
              <StatRow label="gpu" value={renderer?.gpuMs === undefined ? 'unavailable' : `${renderer.gpuMs.toFixed(2)} ms`} />
              <StatRow label="backend" value={renderer?.backend ?? '—'} />
              <StatRow label="draws" value={String(renderer?.drawCalls ?? 0)} />
              <StatRow label="points" value={formatInteger(renderer?.points ?? 0)} />
              <StatRow label="triangles" value={formatInteger(renderer?.triangles ?? 0)} />
              <StatRow label="uploads" value={formatBytes(uploads)} />
              <StatRow label="gpu memory" value={formatBytes(renderer?.gpuResourceBytes ?? 0)} />
              <StatRow label="resources" value={String(renderer?.gpuResourceCount ?? 0)} />
              <StatRow label="tracked alloc" value={formatBytes(renderer?.transientAllocationBytes ?? 0)} />
              <StatRow label="assets" value={`${stats?.assets.ready ?? 0}/${stats?.assets.records ?? 0}`} />
              <StatRow label="asset memory" value={formatBytes(stats?.assets.byteLength ?? 0)} />
              <StatRow label="frame #" value={formatInteger(stats?.frame ?? 0)} />
              {renderer && renderer.renderPasses.length > 0 && (
                <DebugSection title="Render passes">
                  {renderer.renderPasses.map((pass) => <div key={pass} className="break-all text-[10px] leading-4 text-white/60">{pass}</div>)}
                </DebugSection>
              )}
              {runtimeDiagnostics && Object.keys(runtimeDiagnostics).length > 0 && (
                <DebugSection title="Runtime">
                  {Object.entries(runtimeDiagnostics).map(([key, value]) => <StatRow key={key} label={key} value={String(value)} />)}
                </DebugSection>
              )}
              {particleDiagnostics && particleDiagnostics.registeredPrograms > 0 && (
                <DebugSection title="Particle effects">
                  <StatRow label="backend" value={particleDiagnostics.backend} />
                  <StatRow label="instances" value={formatInteger(particleDiagnostics.activeInstances)} />
                  <StatRow label="programs" value={formatInteger(particleDiagnostics.registeredPrograms)} />
                  <StatRow label="active / capacity" value={`${formatInteger(particleDiagnostics.activeEstimate)} / ${formatInteger(particleDiagnostics.capacity)}`} />
                  <StatRow label="spawned / dropped" value={`${formatInteger(particleDiagnostics.spawnedParticles)} / ${formatInteger(particleDiagnostics.droppedParticles)}`} />
                  <StatRow label="sim / render passes" value={`${formatInteger(particleDiagnostics.simulationPasses)} / ${formatInteger(particleDiagnostics.renderPasses)}`} />
                  <StatRow label="event passes / attempts" value={`${formatInteger(particleDiagnostics.eventPasses)} / ${formatInteger(particleDiagnostics.eventAttempts)}`} />
                  <StatRow label="event losses" value={formatInteger(particleDiagnostics.eventLosses)} />
                  <StatRow label="fallbacks" value={formatInteger(particleDiagnostics.backendFallbackCount)} />
                  <StatRow label="accuracy" value={particleDiagnostics.diagnosticAccuracy} />
                  <StatRow label="warm allocations" value={formatInteger(particleDiagnostics.allocationsAfterWarmup)} />
                  <StatRow label="uploads" value={formatBytes(particleDiagnostics.uploadBytes)} />
                  <StatRow label="allocated" value={formatBytes(particleDiagnostics.allocatedBytes)} />
                </DebugSection>
              )}
              {particleInspection && particleInspection.programs.length > 0 && (
                <DebugSection title="Particle inspector">
                  {particleInspection.programs.map((program) => (
                    <div key={program.id} className="mb-2 rounded-lg bg-white/5 p-2">
                      <StatRow label="effect" value={program.id} />
                      <StatRow label="ABI" value={`v${program.stateAbiVersion} · ${program.abiHash.slice(0, 8)}`} />
                      <StatRow label="graph" value={program.graphHash.slice(0, 8)} />
                      <StatRow label="capacity / pooled" value={`${formatInteger(program.capacity)} / ${program.pooledResources}`} />
                      <StatRow label="archetypes" value={program.archetypes.join(', ')} />
                      <StatRow label="emitters" value={program.emitters.join(', ')} />
                      <StatRow label="parameters" value={String(program.parameters.length)} />
                      <StatRow label="bindings" value={String(program.persistedBindings.length)} />
                      <StatRow label="resources" value={String(program.resources.length)} />
                      <StatRow label="shaders" value={String(program.shaders.length)} />
                      {program.capabilityRequirements.length > 0 && (
                        <details className="mt-1 text-[10px] text-white/55">
                          <summary className="cursor-pointer select-none text-white/40">Capabilities</summary>
                          <div className="mt-1 break-words">{program.capabilityRequirements.join(' · ')}</div>
                        </details>
                      )}
                      <details className="mt-1 text-[10px] text-white/55">
                        <summary className="cursor-pointer select-none text-white/40">Resources</summary>
                        <div className="mt-1 space-y-0.5">
                          {program.resources.map((resource) => <div key={resource.name} className="break-all">{resource.name} · {resource.kind}{resource.required ? '' : ' · optional'}</div>)}
                        </div>
                      </details>
                      <details className="mt-1 text-[10px] text-white/55">
                        <summary className="cursor-pointer select-none text-white/40">Compiled shaders</summary>
                        <div className="mt-1 space-y-1">
                          {program.shaders.map((shader) => (
                            <details key={`${shader.backend}:${shader.stage}:${shader.entryPoint}`}>
                              <summary className="cursor-pointer break-all">{shader.backend} · {shader.stage} · {shader.hash.slice(0, 8)}</summary>
                              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre p-1 text-[9px] leading-3 text-white/45">{shader.source}</pre>
                            </details>
                          ))}
                        </div>
                      </details>
                    </div>
                  ))}
                  {particleInspection.instances.map((instance) => (
                    <div key={instance.id} className="mb-2 rounded-lg bg-white/5 p-2">
                      <StatRow label={`#${instance.id} ${instance.effectId}`} value={`${instance.status} · ${instance.effectiveQualityTier}`} />
                      <StatRow label="active / capacity" value={`${formatInteger(instance.diagnostics.activeEstimate)} / ${formatInteger(instance.diagnostics.capacity)}`} />
                      <StatRow label="seed / elapsed" value={`${instance.seed} / ${instance.elapsed.toFixed(2)}s`} />
                      <StatRow label="LOD / render scale" value={`${instance.adaptiveLodLevel} / ${Math.round(instance.renderScale * 100)}%`} />
                      {instance.diagnostics.archetypes && Object.entries(instance.diagnostics.archetypes).map(([id, values]) => <StatRow key={id} label={id} value={`${formatInteger(values.activeEstimate)} / ${formatInteger(values.capacity)}`} />)}
                      {instance.diagnostics.eventAttemptsByTrigger && <StatRow label="events by trigger" value={formatDiagnosticRecord(instance.diagnostics.eventAttemptsByTrigger)} />}
                      {instance.diagnostics.eventAttemptsByPriority && <StatRow label="events by priority" value={formatDiagnosticRecord(instance.diagnostics.eventAttemptsByPriority)} />}
                      <div className="mt-2 grid grid-cols-4 gap-1">
                        <InspectorButton label={instance.status === 'paused' ? 'Resume' : 'Pause'} onClick={() => { particleEffects?.controlInstance(instance.id, { action: instance.status === 'paused' ? 'resume' : 'pause' }); }}>
                          {instance.status === 'paused' ? <Play size={11} /> : <Pause size={11} />}
                        </InspectorButton>
                        <InspectorButton label="Step" onClick={() => { particleEffects?.controlInstance(instance.id, { action: 'step' }); }}><StepForward size={11} /></InspectorButton>
                        <InspectorButton label="Reset" onClick={() => { particleEffects?.controlInstance(instance.id, { action: 'reset' }); }}><RotateCcw size={11} /></InspectorButton>
                        <InspectorButton label="Reseed" onClick={() => { particleEffects?.controlInstance(instance.id, { action: 'reseed', seed: randomInspectorSeed() }); }}><Shuffle size={11} /></InspectorButton>
                      </div>
                      {Object.keys(instance.parameters).length > 0 && (
                        <details className="mt-1 text-[10px] text-white/55">
                          <summary className="cursor-pointer select-none text-white/40">Parameters</summary>
                          {Object.entries(instance.parameters).map(([key, value]) => <StatRow key={key} label={key} value={String(value)} />)}
                        </details>
                      )}
                    </div>
                  ))}
                </DebugSection>
              )}
              {systems.length > 0 && (
                <DebugSection title="Systems">
                  {systems.map((system) => <StatRow key={`${system.stage}:${system.id}`} label={shortSystemName(system.id)} value={`${system.cpuMs.toFixed(2)} ms`} />)}
                </DebugSection>
              )}
            </div>
          </motion.aside>
        ) : (
          <motion.button
            key="button"
            type="button"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => { setOpen(true); }}
            aria-label="Open debug panel"
            className="flex h-8 w-[56px] items-center gap-1.5 rounded-xl bg-black/30 px-2 text-white/35 backdrop-blur-md transition-colors hover:bg-black/50 hover:text-amber-400"
          >
            <Bug size={14} />
            <span className="w-[3ch] text-right font-mono text-[11px] font-semibold text-white/75 [font-variant-numeric:tabular-nums]">{stats ? stats.fps.toFixed(0).padStart(2, ' ') : '--'}</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function DebugSection({ title, children }: { readonly title: string; readonly children: ReactNode }): JSX.Element {
  return <div className="pt-2"><div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/35">{title}</div>{children}</div>;
}

function StatRow({ label, value }: { readonly label: string; readonly value: string }): JSX.Element {
  return <div className="flex items-center justify-between gap-4"><span className="min-w-0 truncate text-white/40">{label}</span><span className="shrink-0 text-white/80">{value}</span></div>;
}

function InspectorButton({ label, onClick, children }: { readonly label: string; readonly onClick: () => void; readonly children: ReactNode }): JSX.Element {
  return <button type="button" onClick={onClick} title={label} aria-label={label} className="flex h-6 items-center justify-center rounded-md bg-white/5 text-white/45 transition-colors hover:bg-white/10 hover:text-amber-300">{children}</button>;
}

function randomInspectorSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function shortSystemName(id: string): string {
  const segments = id.split('.');
  return segments.at(-1) ?? id;
}

function formatDiagnosticRecord(values: Readonly<Partial<Record<string, number>>>): string {
  return Object.entries(values).filter(([, value]) => value !== undefined && value > 0).map(([key, value]) => `${key}:${formatInteger(value ?? 0)}`).join(' · ') || '0';
}
