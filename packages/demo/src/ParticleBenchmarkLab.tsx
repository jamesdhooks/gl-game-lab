import { useMemo, useState } from 'react';
import type { EnginePlugin } from '@hooksjam/gl-game-lab-core';
import { EngineGpu2D, EngineParticleEffects, EngineSchedule, type CompiledParticleProgram2D, type ParticleRenderTier2D } from '@hooksjam/gl-game-lab-engine';
import { GameCanvas } from '@hooksjam/gl-game-lab-react';
import { FIREWORKS_PARTICLE_PROGRAM, ORBITAL_SHRAPNEL_PARTICLE_PROGRAM, SPARKS_PARTICLE_PROGRAM } from '@hooksjam/gl-game-lab-simulations';

const EFFECTS = { sparks: SPARKS_PARTICLE_PROGRAM, fireworks: FIREWORKS_PARTICLE_PROGRAM, orbital: ORBITAL_SHRAPNEL_PARTICLE_PROGRAM } as const;
const CAPACITIES = [65_536, 147_456, 262_144, 589_824] as const;

export function ParticleBenchmarkLab(): JSX.Element {
  const [effectId,setEffectId]=useState<keyof typeof EFFECTS>('sparks'),[capacity,setCapacity]=useState<number>(65_536),[tier,setTier]=useState<ParticleRenderTier2D>('ultra'),[renderScale,setRenderScale]=useState(1);
  const program=EFFECTS[effectId], boundedCapacity=Math.max(program.effect.source.capacity.min,Math.min(program.effect.source.capacity.max,capacity));
  const plugin=useMemo(()=>createParticleBenchmarkPlugin(program,boundedCapacity,tier,renderScale),[program,boundedCapacity,tier,renderScale]);
  return <main className="min-h-screen bg-slate-950 p-4 text-white">
    <div className="mx-auto mb-4 flex max-w-5xl flex-wrap items-center gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
      <strong className="mr-auto text-sm">Particle Benchmark Lab</strong>
      <select aria-label="Benchmark effect" value={effectId} onChange={(event)=>{setEffectId(event.target.value as keyof typeof EFFECTS);}} className="rounded-lg bg-slate-800 px-3 py-2 text-sm">{Object.keys(EFFECTS).map((id)=><option key={id}>{id}</option>)}</select>
      <select aria-label="Benchmark capacity" value={capacity} onChange={(event)=>{setCapacity(Number(event.target.value));}} className="rounded-lg bg-slate-800 px-3 py-2 text-sm">{CAPACITIES.map((value)=><option key={value} value={value}>{value.toLocaleString()}</option>)}</select>
      <select aria-label="Benchmark tier" value={tier} onChange={(event)=>{setTier(event.target.value as ParticleRenderTier2D);}} className="rounded-lg bg-slate-800 px-3 py-2 text-sm">{(['basic','enhanced','ultra'] as const).map((value)=><option key={value}>{value}</option>)}</select>
      <select aria-label="Benchmark render scale" value={renderScale} onChange={(event)=>{setRenderScale(Number(event.target.value));}} className="rounded-lg bg-slate-800 px-3 py-2 text-sm"><option value={1}>100% render</option><option value={0.5}>50% render</option><option value={0.25}>25% render</option></select>
    </div>
    <div className="mx-auto aspect-video max-w-5xl overflow-hidden rounded-2xl ring-1 ring-white/10"><GameCanvas key={`${effectId}:${boundedCapacity}:${tier}:${renderScale}`} plugins={[plugin]} showDiagnostics className="h-full w-full" /></div>
    <p className="mx-auto mt-3 max-w-5xl text-xs text-white/45">Fixed command workload, deterministic seed, live engine diagnostics. URL: ?particleBenchmark=1</p>
  </main>;
}

function createParticleBenchmarkPlugin(program:CompiledParticleProgram2D,capacity:number,tier:ParticleRenderTier2D,renderScale:number):EnginePlugin{
  return {id:'gl-game-lab.demo.particle-benchmark',version:'1.0.0',dependencies:[{id:'gl-game-lab.render-webgl2'}],install:(context)=>{
    const effects=context.get(EngineParticleEffects),gpu=context.get(EngineGpu2D),schedule=context.get(EngineSchedule);
    effects.register(program,{capacity});effects.prewarm(program.effect.source.id);const instance=effects.createInstance(program.effect.source.id,{seed:0x5eed,qualityTier:tier});
    instance.setRenderScale(renderScale);
    const emitterId=program.effect.source.emitters[0]!.id,emitter=instance.emitter(emitterId);let elapsed=0,seed=1;
    instance.setPalette({revision:1,colors:[[1,.35,.08],[1,.85,.2],[.25,.65,1],[.85,.25,1]]});
    if(program.effect.source.id==='orbital-shrapnel')instance.setColliders({revision:1,circles:[{x:640,y:360,radius:54,mode:'kill'}]});
    schedule.addSystem({id:'gl-game-lab.demo.particle-benchmark.update',stage:'update',run:({time})=>{const dt=Math.min(.05,time.deltaSeconds);elapsed+=dt;effects.update(dt);if(elapsed>=.05){elapsed=0;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const angle=(seed/0x1_0000_0000)*Math.PI*2;emitter.writer().position(640,360).direction(angle).spread(Math.PI*2).power(180).seed(seed).count(1024).submit();}}});
    schedule.addSystem({id:'gl-game-lab.demo.particle-benchmark.render',stage:'renderExtract',run:()=>{gpu.submit('particle-benchmark',target=>{effects.render(target);});}});
    context.own('particle benchmark instance',()=>{instance.dispose();});
  }};
}
