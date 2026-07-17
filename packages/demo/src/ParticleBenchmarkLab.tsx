import { useMemo, useState } from 'react';
import type { EnginePlugin } from '@hooksjam/gl-game-lab-core';
import { EngineGpu2D, EngineParticleEffects, EngineSchedule, type CompiledParticleProgram2D, type GameEngine, type ParticleEffectsDiagnostics2D, type ParticleRenderTier2D } from '@hooksjam/gl-game-lab-engine';
import { GameCanvas } from '@hooksjam/gl-game-lab-react';
import { FIREWORKS_PARTICLE_PROGRAM, ORBITAL_SHRAPNEL_PARTICLE_PROGRAM, SPARKS_PARTICLE_PROGRAM } from '@hooksjam/gl-game-lab-simulations';

const EFFECTS = { sparks: SPARKS_PARTICLE_PROGRAM, fireworks: FIREWORKS_PARTICLE_PROGRAM, orbital: ORBITAL_SHRAPNEL_PARTICLE_PROGRAM } as const;
const CAPACITIES = [65_536, 147_456, 262_144, 589_824] as const;
const BENCHMARK_ENDPOINT = '/__gl-game-lab-particle-benchmark';

export function ParticleBenchmarkLab(): JSX.Element {
  const [effectId,setEffectId]=useState<keyof typeof EFFECTS>('sparks'),[capacity,setCapacity]=useState<number>(65_536),[tier,setTier]=useState<ParticleRenderTier2D>('ultra'),[renderScale,setRenderScale]=useState(1);
  const [particleDiagnostics,setParticleDiagnostics]=useState<ParticleEffectsDiagnostics2D>();
  const [debugArchetypes,setDebugArchetypes]=useState<Readonly<Record<string,number>>>();
  const [engine,setEngine]=useState<GameEngine>(),[benchmarkRunning,setBenchmarkRunning]=useState(false),[report,setReport]=useState<ParticleBenchmarkReport2D>();
  const [saveStatus,setSaveStatus]=useState<string>();
  const program=EFFECTS[effectId], boundedCapacity=Math.max(program.effect.source.capacity.min,Math.min(program.effect.source.capacity.max,capacity));
  const plugin=useMemo(()=>createParticleBenchmarkPlugin(program,boundedCapacity,tier,renderScale,setParticleDiagnostics,setDebugArchetypes),[program,boundedCapacity,tier,renderScale]);
  const plugins=useMemo(()=>[plugin] as const,[plugin]);
  return <main className="min-h-screen bg-slate-950 p-4 text-white">
    <div className="mx-auto mb-4 flex max-w-5xl flex-wrap items-center gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
      <strong className="mr-auto text-sm">Particle Benchmark Lab</strong>
      <select aria-label="Benchmark effect" value={effectId} onChange={(event)=>{setParticleDiagnostics(undefined);setDebugArchetypes(undefined);setEffectId(event.target.value as keyof typeof EFFECTS);}} className="rounded-lg bg-slate-800 px-3 py-2 text-sm">{Object.keys(EFFECTS).map((id)=><option key={id}>{id}</option>)}</select>
      <select aria-label="Benchmark capacity" value={capacity} onChange={(event)=>{setCapacity(Number(event.target.value));}} className="rounded-lg bg-slate-800 px-3 py-2 text-sm">{CAPACITIES.map((value)=><option key={value} value={value}>{value.toLocaleString()}</option>)}</select>
      <select aria-label="Benchmark tier" value={tier} onChange={(event)=>{setTier(event.target.value as ParticleRenderTier2D);}} className="rounded-lg bg-slate-800 px-3 py-2 text-sm">{(['basic','enhanced','ultra'] as const).map((value)=><option key={value}>{value}</option>)}</select>
      <select aria-label="Benchmark render scale" value={renderScale} onChange={(event)=>{setRenderScale(Number(event.target.value));}} className="rounded-lg bg-slate-800 px-3 py-2 text-sm"><option value={1}>100% render</option><option value={0.5}>50% render</option><option value={0.25}>25% render</option></select>
      <button type="button" disabled={!engine||benchmarkRunning} onClick={()=>{if(!engine)return;setBenchmarkRunning(true);void measureBenchmark(engine,{effectId,capacity:boundedCapacity,tier,renderScale}).then(setReport).finally(()=>{setBenchmarkRunning(false);});}} className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">{benchmarkRunning?'Measuring…':'Run 5s benchmark'}</button>
      <button type="button" disabled={!report} onClick={()=>{if(!report)return;setSaveStatus('Saving…');void saveBenchmarkReport(report).then((path)=>{setSaveStatus(`Saved ${path}`);}).catch((error:unknown)=>{setSaveStatus(error instanceof Error?error.message:'Save failed');});}} className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Save report</button>
    </div>
    <div className="mx-auto aspect-video max-w-5xl overflow-hidden rounded-2xl ring-1 ring-white/10"><GameCanvas key={`${effectId}:${boundedCapacity}:${tier}:${renderScale}`} plugins={plugins} onReady={setEngine} showDiagnostics className="h-full w-full" /></div>
    <p className="mx-auto mt-3 max-w-5xl text-xs text-white/45">Fixed command workload, deterministic seed, live engine diagnostics. URL: ?particleBenchmark=1</p>
    {saveStatus && <p className="mx-auto mt-2 max-w-5xl text-xs text-amber-300">{saveStatus}</p>}
    <pre data-testid="particle-effect-diagnostics" className="mx-auto mt-3 max-w-5xl overflow-auto rounded-xl bg-black/30 p-3 text-xs text-white/60">{particleDiagnostics?JSON.stringify(particleDiagnostics,null,2):'Warming particle diagnostics…'}</pre>
    <pre data-testid="particle-debug-archetypes" className="mx-auto mt-3 max-w-5xl overflow-auto rounded-xl bg-black/30 p-3 text-xs text-white/60">{debugArchetypes?JSON.stringify(debugArchetypes,null,2):'Waiting for one development-only GPU state sample…'}</pre>
    <pre data-testid="particle-benchmark-report" className="mx-auto mt-3 max-w-5xl overflow-auto rounded-xl bg-black/30 p-3 text-xs text-white/60">{report?JSON.stringify(report,null,2):'Run the fixed benchmark to produce a portable JSON report.'}</pre>
  </main>;
}

interface ParticleBenchmarkReport2D {
  readonly schemaVersion: 1;
  readonly configuration: { readonly effectId: string; readonly capacity: number; readonly tier: ParticleRenderTier2D; readonly renderScale: number; readonly warmupMs: number; readonly sampleMs: number };
  readonly samples: number;
  readonly fps: { readonly average: number; readonly p05: number };
  readonly frameCpuMs: { readonly average: number; readonly p95: number };
  readonly gpuMs: { readonly available: boolean; readonly average?: number; readonly p95?: number };
  readonly particle: ParticleEffectsDiagnostics2D;
}

async function measureBenchmark(engine:GameEngine,configuration:Omit<ParticleBenchmarkReport2D['configuration'],'warmupMs'|'sampleMs'>):Promise<ParticleBenchmarkReport2D>{
  const warmupMs=1_000,sampleMs=4_000;await delay(warmupMs);const fps:number[]=[],cpu:number[]=[],gpu:number[]=[];const started=performance.now();
  while(performance.now()-started<sampleMs){const snapshot=engine.diagnostics.snapshot();if(snapshot){fps.push(snapshot.fps);cpu.push(snapshot.frameCpuMs);if(snapshot.renderer?.gpuMs!==undefined)gpu.push(snapshot.renderer.gpuMs);}await delay(100);}
  const particles=engine.kernel.get(EngineParticleEffects).diagnostics();
  return Object.freeze({schemaVersion:1,configuration:Object.freeze({...configuration,warmupMs,sampleMs}),samples:fps.length,fps:Object.freeze({average:mean(fps),p05:percentile(fps,.05)}),frameCpuMs:Object.freeze({average:mean(cpu),p95:percentile(cpu,.95)}),gpuMs:Object.freeze(gpu.length>0?{available:true,average:mean(gpu),p95:percentile(gpu,.95)}:{available:false}),particle:particles});
}
function delay(ms:number):Promise<void>{return new Promise((resolve)=>{window.setTimeout(resolve,ms);});}
function mean(values:readonly number[]):number{return round(values.reduce((sum,value)=>sum+value,0)/Math.max(1,values.length));}
function percentile(values:readonly number[],fraction:number):number{if(values.length===0)return 0;const sorted=[...values].sort((a,b)=>a-b);return round(sorted[Math.min(sorted.length-1,Math.max(0,Math.floor((sorted.length-1)*fraction)))]??0);}
function round(value:number):number{return Math.round(value*1000)/1000;}
async function saveBenchmarkReport(report:ParticleBenchmarkReport2D):Promise<string>{const response=await fetch(BENCHMARK_ENDPOINT,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});if(!response.ok)throw new Error(`Benchmark save failed (${response.status})`);const payload=await response.json() as {filename?:unknown};if(typeof payload.filename!=='string')throw new Error('Benchmark save returned no path');return payload.filename;}

function createParticleBenchmarkPlugin(program:CompiledParticleProgram2D,capacity:number,tier:ParticleRenderTier2D,renderScale:number,onDiagnostics:(value:ParticleEffectsDiagnostics2D)=>void,onSnapshot:(value:Readonly<Record<string,number>>)=>void):EnginePlugin{
  return {id:'gl-game-lab.demo.particle-benchmark',version:'1.0.0',dependencies:[{id:'gl-game-lab.render-webgl2'}],install:(context)=>{
    const effects=context.get(EngineParticleEffects),gpu=context.get(EngineGpu2D),schedule=context.get(EngineSchedule);
    effects.register(program,{capacity});effects.prewarm(program.effect.source.id);const instance=effects.createInstance(program.effect.source.id,{seed:0x5eed,qualityTier:tier});
    instance.setRenderScale(renderScale);
    const eventEmitter=program.effect.source.emitters.find((candidate)=>{const archetype=program.effect.source.archetypes[program.effect.archetypeIds[candidate.archetypeId]??-1];return (archetype?.events?.length??0)>0;});
    const selectedEmitter=eventEmitter??program.effect.source.emitters[0]!,emitterId=selectedEmitter.id,emitter=instance.emitter(emitterId),isShell=selectedEmitter.archetypeId==='shell',isOrbital=program.effect.source.id==='orbital-shrapnel',emissionCount=isShell?1:1024,emissionInterval=isShell ? .4 : .05,snapshotAt=isShell?4.5:2.5;let elapsed=0,totalElapsed=0,diagnosticElapsed=0,snapshotDone=false,seed=1;
    instance.setPalette({revision:1,colors:[[1,.35,.08],[1,.85,.2],[.25,.65,1],[.85,.25,1]]});
    if(isOrbital){instance.setColliders({revision:1,circles:[{x:640,y:360,radius:54,mode:'kill'}]});instance.setForceFields({revision:1,attractors:[{x:640,y:360,strength:1000,softening:54,falloff:'inverse-square'}]});instance.setDomain({revision:1,shape:'circle',behavior:'wrap',center:[640,360],radius:520,damping:.98});}
    schedule.addSystem({id:'gl-game-lab.demo.particle-benchmark.update',stage:'update',run:({time})=>{const dt=Math.min(.05,time.deltaSeconds);elapsed+=dt;totalElapsed+=dt;diagnosticElapsed+=dt;effects.update(dt);if(elapsed>=emissionInterval){elapsed=0;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const angle=(seed/0x1_0000_0000)*Math.PI*2;emitter.writer().position(640,360).direction(angle).spread(isOrbital?0:Math.PI*2).power(isOrbital?155:180).seed(seed).count(emissionCount).submit();}if(diagnosticElapsed>=.5){diagnosticElapsed=0;onDiagnostics(effects.diagnostics());}if(!snapshotDone&&totalElapsed>=snapshotAt){snapshotDone=true;const snapshot=instance.debugSnapshot(),counts:Record<string,number>={};for(const id of program.effect.source.archetypes.map((entry)=>entry.id))counts[id]=0;let alive=0,nonFinite=0;for(let index=0;index<capacity;index+=1){const offset=index*4,x=snapshot.positions[offset]??0,y=snapshot.positions[offset+1]??0,age=snapshot.positions[offset+2]??0,lifetime=snapshot.positions[offset+3]??0;if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(age)||!Number.isFinite(lifetime)){nonFinite+=1;continue;}if(age>=lifetime)continue;alive+=1;if(snapshot.metadata){const archetype=Math.round(snapshot.metadata[offset]??-1),id=program.effect.source.archetypes[archetype]?.id;if(id)counts[id]=(counts[id]??0)+1;}}if(!snapshot.metadata)counts[selectedEmitter.archetypeId]=alive;counts.__alive=alive;counts.__nonFinite=nonFinite;if(snapshot.eventClaims){let claims=0;for(let index=0;index<capacity;index+=1)if((snapshot.eventClaims[index*4]??12_582_912)<12_582_912)claims+=1;counts.__eventClaims=claims;}onSnapshot(counts);}}});
    schedule.addSystem({id:'gl-game-lab.demo.particle-benchmark.render',stage:'renderExtract',run:()=>{gpu.submit('particle-benchmark',target=>{effects.render(target);});}});
    context.own('particle benchmark instance',()=>{instance.dispose();});
  }};
}
