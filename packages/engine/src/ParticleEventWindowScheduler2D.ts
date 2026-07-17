import type { CompiledParticleProgram2D } from './ParticleEffectCompiler2D.js';

const DEFAULT_WINDOW_CAPACITY = 128;
const EVENT_EPSILON_SECONDS = 0.05;

/** Conservatively identifies intervals in which GPU child events may fire. */
export class ParticleEventWindowScheduler2D {
  private readonly starts: Float32Array;
  private readonly ends: Float32Array;
  private count = 0;

  constructor(private readonly program: CompiledParticleProgram2D, capacity = DEFAULT_WINDOW_CAPACITY) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('Particle event window capacity must be a positive integer');
    this.starts = new Float32Array(capacity);
    this.ends = new Float32Array(capacity);
  }

  schedule(archetypeIndex: number, spawnStart: number, spawnEnd = spawnStart): void { this.scheduleGeneration(archetypeIndex, spawnStart, spawnEnd, 0); }
  hasActiveWindow(time: number): boolean { for (let index=0;index<this.count;index+=1)if(time>=this.starts[index]!&&time<=this.ends[index]!)return true;return false; }
  compact(time: number): void { let write=0;for(let read=0;read<this.count;read+=1){if(this.ends[read]!<time)continue;this.starts[write]=this.starts[read]!;this.ends[write]=this.ends[read]!;write+=1;}this.count=write; }
  clear(): void { this.count = 0; }

  private scheduleGeneration(archetypeIndex:number,spawnStart:number,spawnEnd:number,generation:number):void{
    const archetype=this.program.effect.source.archetypes[archetypeIndex];if(!archetype)return;
    const variability=archetype.lifecycle.lifetimeVariability??0,minimum=archetype.lifecycle.lifetime*Math.max(.05,1-variability),maximum=archetype.lifecycle.lifetime*(1+variability);
    for(const event of archetype.events??[]){if(generation>event.maxGeneration)continue;let start=spawnStart,end=spawnEnd+EVENT_EPSILON_SECONDS;if(event.trigger==='collision')end=spawnEnd+maximum;else if(event.trigger==='age'){start=spawnStart+(event.delay??0);end=spawnEnd+(event.delay??0)+EVENT_EPSILON_SECONDS;}else if(event.trigger==='death'){start=spawnStart+minimum;end=spawnEnd+maximum+EVENT_EPSILON_SECONDS;}this.add(start,end);const child=this.program.effect.archetypeIds[event.childArchetypeId];if(child!==undefined&&generation<event.maxGeneration)this.scheduleGeneration(child,start,end,generation+1);}
  }

  private add(start:number,end:number):void{if(this.count>=this.starts.length){const last=this.starts.length-1;this.starts[last]=Math.min(this.starts[last]!,start);this.ends[last]=Math.max(this.ends[last]!,end);return;}this.starts[this.count]=start;this.ends[this.count]=end;this.count+=1;}
}
