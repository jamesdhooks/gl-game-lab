import { useMemo, useState } from 'react';
import type { EnginePlugin } from '@hooksjam/gl-game-lab-core';
import { EngineGpu2D, EngineParticleEffects, EngineSchedule, type CompiledParticleProgram2D, type ParticleEffectsDiagnostics2D, type ParticleRenderTier2D } from '@hooksjam/gl-game-lab-engine';
import { GameCanvas } from '@hooksjam/gl-game-lab-react';
import { FIREWORKS_PARTICLE_PROGRAM, ORBITAL_SHRAPNEL_PARTICLE_PROGRAM, SPARKS_PARTICLE_PROGRAM } from '@hooksjam/gl-game-lab-simulations';

const EFFECTS = { sparks: SPARKS_PARTICLE_PROGRAM, fireworks: FIREWORKS_PARTICLE_PROGRAM, orbital: ORBITAL_SHRAPNEL_PARTICLE_PROGRAM } as const;
const CAPACITIES = [65_536, 147_456, 262_144, 589_824] as const;

export function ParticleBenchmarkLab(): JSX.Element {
  const [effectId,setEffectId]=useState<keyof typeof EFFECTS>('sparks'),[capacity,setCapacity]=useState<number>(65_536),[tier,setTier]=useState<ParticleRenderTier2D>('ultra'),[renderScale,setRenderScale]=useState(1);
  const [particleDiagnostics,setParticleDiagnostics]=useState<ParticleEffectsDiagnostics2D>();
  const [debugArchetypes,setDebugArchetypes]=useState<Readonly<Record<string,number>>>();
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
    </div>
    <div className="mx-auto aspect-video max-w-5xl overflow-hidden rounded-2xl ring-1 ring-white/10"><GameCanvas key={`${effectId}:${boundedCapacity}:${tier}:${renderScale}`} plugins={plugins} showDiagnostics className="h-full w-full" /></div>
    <p className="mx-auto mt-3 max-w-5xl text-xs text-white/45">Fixed command workload, deterministic seed, live engine diagnostics. URL: ?particleBenchmark=1</p>
    <pre data-testid="particle-effect-diagnostics" className="mx-auto mt-3 max-w-5xl overflow-auto rounded-xl bg-black/30 p-3 text-xs text-white/60">{particleDiagnostics?JSON.stringify(particleDiagnostics,null,2):'Warming particle diagnostics…'}</pre>
    <pre data-testid="particle-debug-archetypes" className="mx-auto mt-3 max-w-5xl overflow-auto rounded-xl bg-black/30 p-3 text-xs text-white/60">{debugArchetypes?JSON.stringify(debugArchetypes,null,2):'Waiting for one development-only GPU state sample…'}</pre>
  </main>;
}

function createParticleBenchmarkPlugin(program:CompiledParticleProgram2D,capacity:number,tier:ParticleRenderTier2D,renderScale:number,onDiagnostics:(value:ParticleEffectsDiagnostics2D)=>void,onSnapshot:(value:Readonly<Record<string,number>>)=>void):EnginePlugin{
  return {id:'gl-game-lab.demo.particle-benchmark',version:'1.0.0',dependencies:[{id:'gl-game-lab.render-webgl2'}],install:(context)=>{
    const effects=context.get(EngineParticleEffects),gpu=context.get(EngineGpu2D),schedule=context.get(EngineSchedule);
    effects.register(program,{capacity});effects.prewarm(program.effect.source.id);const instance=effects.createInstance(program.effect.source.id,{seed:0x5eed,qualityTier:tier});
    instance.setRenderScale(renderScale);
    const eventEmitter=program.effect.source.emitters.find((candidate)=>{const archetype=program.effect.source.archetypes[program.effect.archetypeIds[candidate.archetypeId]??-1];return (archetype?.events?.length??0)>0;});
    const selectedEmitter=eventEmitter??program.effect.source.emitters[0]!,emitterId=selectedEmitter.id,emitter=instance.emitter(emitterId),isShell=selectedEmitter.archetypeId==='shell',emissionCount=isShell?1:1024,emissionInterval=isShell ? .4 : .05,snapshotAt=isShell?4.5:2.5;let elapsed=0,totalElapsed=0,diagnosticElapsed=0,snapshotDone=false,seed=1;
    instance.setPalette({revision:1,colors:[[1,.35,.08],[1,.85,.2],[.25,.65,1],[.85,.25,1]]});
    if(program.effect.source.id==='orbital-shrapnel')instance.setColliders({revision:1,circles:[{x:640,y:360,radius:54,mode:'kill'}]});
    schedule.addSystem({id:'gl-game-lab.demo.particle-benchmark.update',stage:'update',run:({time})=>{const dt=Math.min(.05,time.deltaSeconds);elapsed+=dt;totalElapsed+=dt;diagnosticElapsed+=dt;effects.update(dt);if(elapsed>=emissionInterval){elapsed=0;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const angle=(seed/0x1_0000_0000)*Math.PI*2;emitter.writer().position(640,360).direction(angle).spread(Math.PI*2).power(180).seed(seed).count(emissionCount).submit();}if(diagnosticElapsed>=.5){diagnosticElapsed=0;onDiagnostics(effects.diagnostics());}if(!snapshotDone&&totalElapsed>=snapshotAt){snapshotDone=true;const snapshot=instance.debugSnapshot(),counts:Record<string,number>={};for(const id of program.effect.source.archetypes.map((entry)=>entry.id))counts[id]=0;if(snapshot.metadata)for(let index=0;index<capacity;index+=1){const offset=index*4;if((snapshot.positions[offset+2]??0)>=(snapshot.positions[offset+3]??0))continue;const archetype=Math.round(snapshot.metadata[offset]??-1),id=program.effect.source.archetypes[archetype]?.id;if(id)counts[id]=(counts[id]??0)+1;}onSnapshot(counts);}}});
    schedule.addSystem({id:'gl-game-lab.demo.particle-benchmark.render',stage:'renderExtract',run:()=>{gpu.submit('particle-benchmark',target=>{effects.render(target);});}});
    context.own('particle benchmark instance',()=>{instance.dispose();});
  }};
}
