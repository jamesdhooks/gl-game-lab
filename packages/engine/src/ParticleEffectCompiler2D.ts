import type { CompiledParticleEffect2D } from './ParticleEffectGraph2D.js';
import type { ParticleRenderTier2D } from './ParticleEffects2D.js';

export type ParticleShaderBackend2D = 'webgl2' | 'webgpu';
export type ParticleShaderStage2D = 'simulation' | 'event' | 'vertex' | 'fragment';

export interface ParticleShaderBinding2D {
  readonly name: string;
  readonly kind: 'uniform' | 'texture' | 'sampler' | 'storage' | 'render-target';
  readonly dataType: string;
  readonly required: boolean;
}

export interface ParticleShaderReflection2D {
  readonly bindings: readonly ParticleShaderBinding2D[];
  readonly stateTargets: 2 | 3;
  readonly archetypeCount: number;
  readonly usesCollisions: boolean;
  readonly usesEvents: boolean;
  readonly usesTurbulence: boolean;
}

export interface ParticleCompiledShader2D {
  readonly backend: ParticleShaderBackend2D;
  readonly stage: ParticleShaderStage2D;
  readonly entryPoint: string;
  readonly source: string;
  readonly hash: string;
}

export interface CompiledParticleRenderPass2D {
  readonly id: string;
  readonly tier: ParticleRenderTier2D;
  readonly kind: 'points' | 'streaks' | 'trails' | 'bloom';
  readonly blend: 'opaque' | 'alpha' | 'additive' | 'multiply';
}

export interface ParticleModuleCompilerExtension2D {
  readonly id: string;
  readonly supports: readonly ParticleShaderBackend2D[];
  readonly parameters?: Readonly<Record<string, 'number' | 'boolean' | 'vector2' | 'color'>>;
  readonly cpuReference: (state: Float32Array, parameters: Readonly<Record<string, number>>, deltaSeconds: number) => void;
  readonly glslSimulation?: string;
  readonly glslRender?: string;
  readonly wgslSimulation?: string;
  readonly bindings?: readonly ParticleShaderBinding2D[];
}

export interface CompiledParticleProgram2D {
  readonly effect: CompiledParticleEffect2D;
  readonly webgl2: {
    readonly simulation: ParticleCompiledShader2D;
    readonly event?: ParticleCompiledShader2D;
    readonly eventClaimVertex?: ParticleCompiledShader2D;
    readonly eventClaimFragment?: ParticleCompiledShader2D;
    readonly vertex: ParticleCompiledShader2D;
    readonly streakVertex: ParticleCompiledShader2D;
    readonly fragment: ParticleCompiledShader2D;
  };
  readonly webgpu: {
    readonly simulation: ParticleCompiledShader2D;
    readonly event?: ParticleCompiledShader2D;
    readonly eventResolve?: ParticleCompiledShader2D;
    readonly render: ParticleCompiledShader2D;
  };
  readonly renderPasses: Readonly<Record<ParticleRenderTier2D, readonly CompiledParticleRenderPass2D[]>>;
  readonly reflection: ParticleShaderReflection2D;
}

export function compileParticleProgram2D(
  effect: CompiledParticleEffect2D,
  extensions: readonly ParticleModuleCompilerExtension2D[] = [],
): CompiledParticleProgram2D {
  validateExtensions(extensions);
  validateRequiredExtensions(effect, extensions);
  if (effect.source.archetypes.length > 32) throw new Error('Particle compiler supports at most 32 archetypes per effect');
  const usesCollisions = effect.source.archetypes.some((entry) => entry.collision !== undefined);
  const usesEvents = effect.source.archetypes.some((entry) => (entry.events?.length ?? 0) > 0);
  const usesTurbulence = effect.source.archetypes.some((entry) => (entry.motion.turbulence ?? 0) !== 0);
  const bindings = baseBindings(effect.report.requiredStateTargets, usesCollisions, usesEvents, extensions);
  const reflection: ParticleShaderReflection2D = Object.freeze({
    bindings: Object.freeze(bindings),
    stateTargets: effect.report.requiredStateTargets,
    archetypeCount: effect.source.archetypes.length,
    usesCollisions,
    usesEvents,
    usesTurbulence,
  });
  const glslSimulation = buildGlslSimulation(effect, extensions, usesCollisions, usesTurbulence);
  const glslEvent = usesEvents ? buildGlslEvent(effect) : undefined;
  const glslEventClaimVertex = usesEvents ? buildGlslEventClaimVertex(effect) : undefined;
  const glslEventClaimFragment = usesEvents ? buildGlslEventClaimFragment() : undefined;
  const glslVertex = buildGlslVertex(effect, extensions, false);
  const glslStreakVertex = buildGlslVertex(effect, extensions, true);
  const glslFragment = buildGlslFragment(extensions);
  const wgslSimulation = buildWgslSimulation(effect, extensions, usesCollisions, usesTurbulence);
  const wgslEvent = usesEvents ? buildWgslEventAppend(effect) : undefined;
  const wgslEventResolve = usesEvents ? buildWgslEventResolve(effect) : undefined;
  const wgslRender = buildWgslRender();
  return Object.freeze({
    effect,
    webgl2: Object.freeze({
      simulation: shader('webgl2', 'simulation', 'main', glslSimulation),
      ...(glslEvent === undefined ? {} : { event: shader('webgl2', 'event', 'main', glslEvent) }),
      ...(glslEventClaimVertex === undefined ? {} : { eventClaimVertex: shader('webgl2', 'event', 'main', glslEventClaimVertex) }),
      ...(glslEventClaimFragment === undefined ? {} : { eventClaimFragment: shader('webgl2', 'event', 'main', glslEventClaimFragment) }),
      vertex: shader('webgl2', 'vertex', 'main', glslVertex),
      streakVertex: shader('webgl2', 'vertex', 'main', glslStreakVertex),
      fragment: shader('webgl2', 'fragment', 'main', glslFragment),
    }),
    webgpu: Object.freeze({
      simulation: shader('webgpu', 'simulation', 'simulate', wgslSimulation),
      ...(wgslEvent === undefined ? {} : { event: shader('webgpu', 'event', 'appendEvents', wgslEvent) }),
      ...(wgslEventResolve === undefined ? {} : { eventResolve: shader('webgpu', 'event', 'resolveEvents', wgslEventResolve) }),
      render: shader('webgpu', 'vertex', 'particleVertex', wgslRender),
    }),
    renderPasses: compileRenderPasses(effect),
    reflection,
  });
}

export function validateParticleShaderBindings2D(
  reflection: ParticleShaderReflection2D,
  available: ReadonlySet<string>,
): void {
  for (const binding of reflection.bindings) if (binding.required && !available.has(binding.name)) throw new Error(`Missing required particle shader binding: ${binding.name}`);
}

function buildGlslSimulation(effect: CompiledParticleEffect2D, extensions: readonly ParticleModuleCompilerExtension2D[], collisions: boolean, turbulence: boolean): string {
  const targets = effect.report.requiredStateTargets;
  return `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uPositionState;
uniform sampler2D uVelocityState;
${targets === 3 ? 'uniform sampler2D uMetadataState;' : ''}
uniform ivec2 uStateSize;
uniform int uCapacity;
uniform vec4 uArchetypePools[${Math.max(1, effect.source.archetypes.length)}];
uniform sampler2D uParticleCommandData;
uniform int uParticleCommandCount;
uniform int uParticleCommandTexels;
uniform float uDt;
uniform vec2 uCanvasSize;
uniform vec4 uArchetypeMotion[${Math.max(1, effect.source.archetypes.length)}];
uniform vec4 uArchetypeForce[${Math.max(1, effect.source.archetypes.length)}];
uniform vec4 uArchetypeCollision[${Math.max(1, effect.source.archetypes.length)}];
uniform vec4 uEmitterSource[${Math.max(1, effect.source.emitters.length)}];
uniform vec4 uCircleColliders[16];
uniform vec4 uCapsuleA[16];
uniform vec4 uCapsuleB[16];
uniform int uCircleColliderCount;
uniform int uCapsuleColliderCount;
layout(location=0) out vec4 outPosition;
layout(location=1) out vec4 outVelocity;
${targets === 3 ? 'layout(location=2) out vec4 outMetadata;' : ''}
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
bool readCommand(int id, out vec4 a, out vec4 b, out vec4 c, out vec4 d, out int relative) {
  if (uParticleCommandCount <= 0) return false;
  int low = 0, high = uParticleCommandCount;
  // The command texture stores monotonically increasing prefix starts. With a
  // maximum of 64 commands, six lower-bound comparisons are sufficient.
  for (int iteration = 0; iteration < 6; iteration++) {
    int middle = (low + high) / 2;
    if (middle >= uParticleCommandCount) { high = middle; continue; }
    vec4 probe = texelFetch(uParticleCommandData, ivec2(middle * uParticleCommandTexels, 0), 0);
    if (int(probe.y + .5) <= id) low = middle + 1; else high = middle;
  }
  int commandIndex = low - 1;
  if (commandIndex < 0 || commandIndex >= uParticleCommandCount) return false;
  int offset = commandIndex * uParticleCommandTexels;
  a = texelFetch(uParticleCommandData, ivec2(offset, 0), 0);
  d = texelFetch(uParticleCommandData, ivec2(offset+3,0),0);
  relative = id - int(a.y + .5) + int(d.y + .5);
  if (id < int(a.y + .5) || id >= int(a.y + a.z + .5)) return false;
  b=texelFetch(uParticleCommandData,ivec2(offset+1,0),0);
  c=texelFetch(uParticleCommandData,ivec2(offset+2,0),0);
  return true;
}
void main() {
  ivec2 uv = ivec2(gl_FragCoord.xy);
  int id = uv.y * uStateSize.x + uv.x;
  vec4 stateA = texelFetch(uPositionState, uv, 0);
  vec4 stateB = texelFetch(uVelocityState, uv, 0);
  ${targets === 3 ? 'vec4 stateC = texelFetch(uMetadataState, uv, 0);' : 'vec4 stateC = vec4(0.0);'}
  int archetype = clamp(int(stateC.x + 0.5), 0, ${Math.max(0, effect.source.archetypes.length - 1)});
  vec4 motion = uArchetypeMotion[archetype];
  vec4 force = uArchetypeForce[archetype];
  vec4 collision = uArchetypeCollision[archetype];
  if (stateA.z < stateA.w) {
    stateC.w = float(int(stateC.w + .5) & ~1); bool collided = false;
    stateA.z += uDt;
    stateB.y += motion.x * uDt;
    stateB.xy *= exp(-max(0.0, motion.y) * uDt);
    if (abs(force.x)+abs(force.y) > 0.0 && uCircleColliderCount > 0) { vec2 delta=uCircleColliders[0].xy-stateA.xy; float distance=max(length(delta),1.0); vec2 radial=delta/distance; float falloff=force.z<.5?1.0:force.z<1.5?1.0/distance:1.0/(distance*distance); stateB.xy+=(radial*force.x+vec2(-radial.y,radial.x)*force.y)*falloff*uDt; }
    ${turbulence ? 'float noise = hash21(stateA.xy + stateC.zz); stateB.xy += vec2(cos(noise * 6.2831853), sin(noise * 6.2831853)) * motion.z * uDt;' : ''}
    stateB.w += motion.w * uDt;
    stateB.z += stateB.w * uDt;
    stateA.xy += stateB.xy * uDt;
    ${collisions ? `int collisionFlags=int(collision.w+.5);
    if ((collisionFlags & 1) != 0) { if(stateA.x<0.0||stateA.x>uCanvasSize.x){collided=true;stateA.x=clamp(stateA.x,0.0,uCanvasSize.x);stateB.x=-stateB.x*collision.x;} if(stateA.y<0.0||stateA.y>uCanvasSize.y){collided=true;stateA.y=clamp(stateA.y,0.0,uCanvasSize.y);stateB.y=-stateB.y*collision.x;} }
    if ((collisionFlags & 2) != 0) for(int collider=0;collider<16;collider++){if(collider>=uCircleColliderCount)break;vec4 circle=uCircleColliders[collider];vec2 delta=stateA.xy-circle.xy;float distance=length(delta);if(distance<circle.z){collided=true;if(circle.w>.5){stateA.z=stateA.w;}else{vec2 normal=distance>.0001?delta/distance:vec2(0,-1);stateA.xy=circle.xy+normal*circle.z;stateB.xy-=normal*(1.0+collision.x)*dot(stateB.xy,normal);stateB.xy*=max(0.0,1.0-collision.y);stateA.z+=stateA.w*collision.z;}}}
    if ((collisionFlags & 4) != 0) for(int collider=0;collider<16;collider++){if(collider>=uCapsuleColliderCount)break;vec4 segment=uCapsuleA[collider];vec4 data=uCapsuleB[collider];vec2 ab=segment.zw-segment.xy;float t=clamp(dot(stateA.xy-segment.xy,ab)/max(dot(ab,ab),.0001),0.0,1.0);vec2 closest=segment.xy+ab*t,delta=stateA.xy-closest;float distance=length(delta);if(distance<data.x){collided=true;if(data.y>.5){stateA.z=stateA.w;}else{vec2 normal=distance>.0001?delta/distance:vec2(0,-1);stateA.xy=closest+normal*data.x;stateB.xy-=normal*(1.0+collision.x)*dot(stateB.xy,normal);stateB.xy*=max(0.0,1.0-collision.y);stateA.z+=stateA.w*collision.z;}}} if(collided)stateC.w=float(int(stateC.w+.5)|1);` : ''}
  }
  vec4 commandA=vec4(0), commandB=vec4(0), commandC=vec4(0), commandD=vec4(0); int relative=0;
  if (id < uCapacity && readCommand(id, commandA, commandB, commandC, commandD, relative)) {
    float randomA = hash21(vec2(commandD.x + float(relative), 1.0));
    float randomB = hash21(vec2(commandD.x + float(relative), 5.0));
    int packedShape = int(commandA.w + .5), shape = packedShape % 32, overflowPolicy = packedShape / 32;
    int emitter = clamp(int(commandD.w + .5), 0, ${Math.max(0, effect.source.emitters.length - 1)});
    vec4 source = uEmitterSource[emitter];
    float angle = commandC.x + (randomA - .5) * commandC.y;
    vec2 offset = vec2(0.0);
    if (shape == 1) { float a=randomA*6.2831853; offset=vec2(cos(a),sin(a))*sqrt(randomB)*source.x; }
    else if (shape == 2) { offset=vec2(cos(commandC.x),sin(commandC.x))*(randomA-.5)*source.y; }
    else if (shape == 4 || shape == 5) { angle=commandC.x+(randomA-.5)*(shape==5?6.2831853:source.z); offset=vec2(cos(angle),sin(angle))*source.x; }
    else if (shape == 6) { angle=commandC.x+randomA*6.2831853; }
    else if (shape == 7) { angle=commandC.x+6.2831853*(float(relative)/max(1.0,commandA.z))*max(1.0,source.z/6.2831853)+(randomB-.5)*commandC.y; }
    else if (shape == 8) { angle=commandC.x+float(relative%4)*1.5707963+float(relative)*.075+(randomA-.5)*commandC.y; }
    else if (shape == 9) { offset=vec2((randomA-.5)*source.y,0.0); angle=commandC.x+(randomB-.5)*commandC.y; }
    float power = commandC.z * mix(.72, 1.28, hash21(vec2(commandD.x + float(relative), 2.0)));
    if (overflowPolicy != 1 || stateA.z >= stateA.w) {
      stateA = vec4(commandB.xy+offset, 0.0, commandC.w * mix(max(.05, 1.0-commandD.z), 1.0+commandD.z, hash21(vec2(commandD.x + float(relative), 3.0))));
      stateB = vec4(commandB.zw + vec2(cos(angle), sin(angle)) * power, 0.0, 0.0);
      stateC = vec4(commandA.x, 0.0, hash21(vec2(commandD.x + float(relative), 4.0)), 0.0);
    }
  }
  ${extensions.map((entry) => entry.glslSimulation ?? '').filter(Boolean).join('\n  ')}
  outPosition = stateA;
  outVelocity = stateB;
  ${targets === 3 ? 'outMetadata = stateC;' : ''}
}`;
}

function buildGlslEvent(effect: CompiledParticleEffect2D): string {
  const events = compiledEvents(effect);
  const eventBranches = events.map((entry) => `if (priority == ${entry.priority} && slot == ${entry.prioritySlot}) { child=${entry.child}; lifetime=${glslFloat(entry.lifetime)}; inheritance=${glslFloat(entry.inheritance)}; powerScale=${glslFloat(entry.powerScale)}; spread=${glslFloat(entry.spread)}; }`).join('\n  else ');
  const markBranches = events.filter((entry) => entry.trigger !== 'collision').map((entry) => {
    const trigger = eventTriggerGlsl(entry, 'a', 'c');
    return `if(int(c.x+.5)==${entry.parent} && c.y<=${glslFloat(entry.maxGeneration)} && (${trigger}))c.w=float(int(c.w+.5)|${eventFlag(entry.parentSlot)});`;
  }).join('\n  ');
  return `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uPositionState;
uniform sampler2D uVelocityState;
uniform sampler2D uMetadataState;
uniform sampler2D uParticleEventClaims;
uniform float uDt;
uniform ivec2 uStateSize;
uniform int uCapacity;
uniform vec4 uArchetypePools[${Math.max(1, effect.source.archetypes.length)}];
layout(location=0) out vec4 outPosition;
layout(location=1) out vec4 outVelocity;
layout(location=2) out vec4 outMetadata;
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
void main() {
  ivec2 uv = ivec2(gl_FragCoord.xy);
  vec4 a = texelFetch(uPositionState, uv, 0);
  vec4 b = texelFetch(uVelocityState, uv, 0);
  vec4 c = texelFetch(uMetadataState, uv, 0);
  ${markBranches}
  float claim=texelFetch(uParticleEventClaims,uv,0).x;
  int id=uv.y*uStateSize.x+uv.x;
  if(id<uCapacity && claim<12582912.0){
    int code=int(claim+.5), priority=code/4194304, packed=code-priority*4194304;
    int parent=packed/4, slot=packed-parent*4;
    ivec2 parentUv=ivec2(parent%uStateSize.x,parent/uStateSize.x);
    vec4 pa=texelFetch(uPositionState,parentUv,0),pb=texelFetch(uVelocityState,parentUv,0),pc=texelFetch(uMetadataState,parentUv,0);
    int child=-1;float lifetime=0.0,inheritance=0.0,powerScale=0.0,spread=6.2831853;
    ${eventBranches}
    if(child>=0){vec4 pool=uArchetypePools[child];bool inPool=id>=int(pool.x+.5)&&id<int(pool.x+pool.y+.5);bool writable=a.z>=a.w||int(pool.z+.5)!=1;
      if(inPool&&writable){float random=hash21(vec2(float(id),claim));float angle=random*spread;float power=max(24.0,length(pb.xy))*powerScale;
        a=vec4(pa.xy,0.0,lifetime);b=vec4(pb.xy*inheritance+vec2(cos(angle),sin(angle))*power,0.0,0.0);c=vec4(float(child),pc.y+1.0,pc.z+random,0.0);}}
  }
  outPosition = a; outVelocity = b; outMetadata = c;
}`;
}

function buildGlslEventClaimVertex(effect: CompiledParticleEffect2D): string {
  const events = compiledEvents(effect);
  const candidateLanes = Math.max(1, ...effect.source.archetypes.map((archetype) => archetype.events?.length ?? 0));
  const branches: string[] = [];
  for (let archetypeIndex = 0; archetypeIndex < effect.source.archetypes.length; archetypeIndex += 1) {
    for (const entry of events.filter((event) => event.parent === archetypeIndex)) {
      const trigger = eventTriggerGlsl(entry, 'a', 'c');
      const notFired = entry.trigger === 'collision' ? 'true' : `(int(c.w+.5)&${eventFlag(entry.parentSlot)})==0`;
      branches.push(`if(archetype==${archetypeIndex} && lane==${entry.parentSlot} && c.y<=${glslFloat(entry.maxGeneration)} && (${notFired}) && (${trigger}) && hash11(float(parent*31+lane*17+${entry.global}))<=${glslFloat(entry.probability)}){priority=${entry.priority};slot=${entry.prioritySlot};child=${entry.child};childCount=${entry.count};valid=true;}`);
    }
  }
  return `#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
uniform sampler2D uPositionState;uniform sampler2D uMetadataState;uniform ivec2 uStateSize;uniform int uCapacity;uniform float uDt;uniform vec4 uArchetypePools[${Math.max(1, effect.source.archetypes.length)}];
flat out float vClaim;flat out float vChildCount;flat out float vPoolStart;flat out float vPoolEnd;flat out float vFallback;
float hash11(float value){return fract(sin(value*91.3458+17.123)*47453.5453);}
void main(){int parent=gl_VertexID/${candidateLanes},lane=gl_VertexID-parent*${candidateLanes};vClaim=12582912.0;vChildCount=0.0;vPoolStart=0.0;vPoolEnd=0.0;vFallback=0.0;gl_PointSize=1.0;
 if(parent>=uCapacity){gl_Position=vec4(2.0);return;}ivec2 uv=ivec2(parent%uStateSize.x,parent/uStateSize.x);vec4 a=texelFetch(uPositionState,uv,0),c=texelFetch(uMetadataState,uv,0);int archetype=int(c.x+.5),priority=0,slot=0,child=-1,childCount=0;bool valid=false;
 ${branches.join('\n ')}
 if(!valid||child<0){gl_Position=vec4(2.0);return;}vec4 pool=uArchetypePools[child];int poolStart=int(pool.x+.5),poolCount=int(pool.y+.5);childCount=min(childCount,poolCount);int pointWidth=max(1,int(ceil(sqrt(float(childCount)))));int firstFullRow=(poolStart+uStateSize.x-1)/uStateSize.x,lastExclusive=(poolStart+poolCount)/uStateSize.x;int rowCount=max(0,lastExclusive-firstFullRow);uint hash=uint(parent)*1664525u+uint(lane)*1013904223u+uint(slot+priority*4)*2246822519u;int originX=0,originY=0;if(rowCount<=0||pointWidth>uStateSize.x){vFallback=1.0;pointWidth=min(poolCount,uStateSize.x);originX=min(poolStart%uStateSize.x,max(0,uStateSize.x-pointWidth));originY=poolStart/uStateSize.x;}else{int availableX=max(1,uStateSize.x-pointWidth+1),availableY=max(1,rowCount-pointWidth+1);originX=int(hash%uint(availableX));originY=firstFullRow+int((hash/uint(availableX))%uint(availableY));}vec2 center=vec2(float(originX)+float(pointWidth)*.5,float(originY)+float(pointWidth)*.5);vec2 clip=center/vec2(uStateSize)*2.0-1.0;gl_Position=vec4(clip,0,1);gl_PointSize=float(pointWidth);vClaim=float(priority*4194304+parent*4+slot);vChildCount=float(childCount);vPoolStart=float(poolStart);vPoolEnd=float(poolStart+poolCount);}`;
}

function buildGlslEventClaimFragment(): string { return `#version 300 es
precision highp float;precision highp int;uniform ivec2 uStateSize;flat in float vClaim;flat in float vChildCount;flat in float vPoolStart;flat in float vPoolEnd;flat in float vFallback;out vec4 outClaim;void main(){float id=floor(gl_FragCoord.y)*float(uStateSize.x)+floor(gl_FragCoord.x);if(id<vPoolStart||id>=vPoolEnd)discard;if(vFallback<.5){float width=ceil(sqrt(vChildCount));vec2 cell=floor(gl_PointCoord*width);float ordinal=cell.y*width+cell.x;if(ordinal>=vChildCount)discard;}outClaim=vec4(vClaim);}`; }

interface CompiledEventEntry { parent:number; parentSlot:number; child:number; global:number; priority:number; prioritySlot:number; count:number; trigger:string; probability:number; maxGeneration:number; delay:number; inheritance:number; powerScale:number; spread:number; lifetime:number }
function compiledEvents(effect: CompiledParticleEffect2D): CompiledEventEntry[] {
  const result: CompiledEventEntry[]=[]; const slots=[0,0,0]; let global=0;
  effect.source.archetypes.forEach((archetype,parent)=>{(archetype.events??[]).forEach((event,parentSlot)=>{if(parentSlot>=22)throw new Error(`Particle archetype ${archetype.id} exceeds 22 persistent event slots`);const priority=event.priority==='primary'?0:event.priority==='secondary'?1:2,prioritySlot=slots[priority] ?? 0;if(prioritySlot>=4)throw new Error(`Particle event priority ${event.priority ?? 'cosmetic'} exceeds four compiled slots`);slots[priority]=prioritySlot+1;const child=effect.archetypeIds[event.childArchetypeId];if(child===undefined)throw new Error(`Unknown particle event child ${event.childArchetypeId}`);result.push({parent,parentSlot,child,global:global++,priority,prioritySlot,count:event.count,trigger:event.trigger,probability:event.probability,maxGeneration:event.maxGeneration,delay:event.delay??0,inheritance:event.velocityInheritance??0,powerScale:event.powerScale??0.35,spread:event.spread??Math.PI*2,lifetime:effect.source.archetypes[child]!.lifecycle.lifetime});});});
  return result;
}

function eventTriggerGlsl(entry: CompiledEventEntry, position: string, metadata: string): string {
  if (entry.trigger === 'death') return `${position}.z>=${position}.w && ${position}.z-uDt<${position}.w`;
  if (entry.trigger === 'birth') return `${position}.z<=uDt`;
  if (entry.trigger === 'collision') return `(int(${metadata}.w+.5)&1)!=0`;
  return `${position}.z>=${glslFloat(entry.delay)} && ${position}.z-uDt<${glslFloat(entry.delay)}`;
}

function eventFlag(parentSlot: number): number { return 1 << (parentSlot + 1); }

function glslFloat(value: number): string { const serialized=String(value); return serialized.includes('.') || serialized.includes('e') ? serialized : `${serialized}.0`; }

function buildGlslVertex(effect: CompiledParticleEffect2D, extensions: readonly ParticleModuleCompilerExtension2D[], streak: boolean): string {
  const targets = effect.report.requiredStateTargets;
  return `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uPositionState;
uniform sampler2D uVelocityState;
${targets === 3 ? 'uniform sampler2D uMetadataState;' : ''}
uniform ivec2 uStateSize;
uniform int uParticleCapacity;
uniform int uRenderStride;
uniform int uRenderPhase;
uniform vec2 uCanvasSize;
uniform float uPointScale;
uniform vec4 uArchetypeSize[${Math.max(1, effect.source.archetypes.length)}];
uniform vec4 uArchetypeLength[${Math.max(1, effect.source.archetypes.length)}];
uniform vec4 uArchetypeAlpha[${Math.max(1, effect.source.archetypes.length)}];
uniform vec4 uArchetypeIntensity[${Math.max(1, effect.source.archetypes.length)}];
out float vAge;
out float vSeed;
out float vAlpha;
out float vIntensity;
flat out int vStreak;
void main() {
  vStreak=${streak ? '1' : '0'};
  int drawIndex = ${streak ? 'gl_VertexID / 6' : 'gl_VertexID'};
  int index = drawIndex * max(1, uRenderStride) + uRenderPhase;
  ivec2 uv = ivec2(index % int(uStateSize.x), index / int(uStateSize.x));
  vec4 a = texelFetch(uPositionState, uv, 0);
  ${targets === 3 ? 'vec4 c = texelFetch(uMetadataState, uv, 0);' : 'vec4 c = vec4(0.0);'}
  if (index >= uParticleCapacity || a.w <= 0.0) { gl_Position=vec4(2.0); gl_PointSize=0.0; vAge=1.0; vSeed=0.0; vAlpha=0.0; vIntensity=0.0; return; }
  vAge = clamp(a.z / max(a.w, 0.0001), 0.0, 1.0);
  vSeed = c.z;
  int archetype=clamp(int(c.x+.5),0,${Math.max(0, effect.source.archetypes.length - 1)});
  vec4 sizeCurve=uArchetypeSize[archetype], lengthCurve=uArchetypeLength[archetype];
  float curveAge=pow(vAge,max(.01,sizeCurve.z));
  float size=max(0.0,mix(sizeCurve.x,sizeCurve.y,curveAge))*uPointScale;
  vec4 alphaCurve=uArchetypeAlpha[archetype], intensityCurve=uArchetypeIntensity[archetype];
  vAlpha=mix(alphaCurve.x,alphaCurve.y,pow(vAge,max(.01,alphaCurve.z)));
  vIntensity=mix(intensityCurve.x,intensityCurve.y,pow(vAge,max(.01,intensityCurve.z)));
  vec2 clip = vec2(a.x / uCanvasSize.x * 2.0 - 1.0, 1.0 - a.y / uCanvasSize.y * 2.0);
  ${streak ? `vec4 b=texelFetch(uVelocityState,uv,0); int corner=gl_VertexID%6;
  vec2 corners[6]=vec2[6](vec2(0,-1),vec2(1,-1),vec2(0,1),vec2(0,1),vec2(1,-1),vec2(1,1));
  vec2 axis=length(b.xy)>0.001?normalize(b.xy):vec2(1,0), normal=vec2(-axis.y,axis.x);
  float streakLength=max(size,mix(lengthCurve.x,lengthCurve.y,pow(vAge,max(.01,lengthCurve.z)))*length(b.xy)*.016);
  vec2 local=-axis*corners[corner].x*streakLength+normal*corners[corner].y*size*.5;
  clip+=vec2(local.x/uCanvasSize.x*2.0,-local.y/uCanvasSize.y*2.0);` : ''}
  gl_Position = vec4(clip, 0.0, a.z < a.w ? 1.0 : 0.0);
  gl_PointSize = max(0.0, mix(uPointScale, 0.0, vAge));
  ${streak ? 'gl_PointSize=1.0;' : 'gl_PointSize=size;'}
  ${extensions.map((entry) => entry.glslRender ?? '').filter(Boolean).join('\n  ')}
}`;
}

function buildGlslFragment(extensions: readonly ParticleModuleCompilerExtension2D[]): string {
  return `#version 300 es
precision highp float;
precision highp int;
uniform vec3 uPalette[8];
uniform int uPaletteCount;
uniform float uIntensity;
in float vAge;
in float vSeed;
in float vAlpha;
in float vIntensity;
flat in int vStreak;
out vec4 outColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float coverage = vStreak == 1 ? 1.0 : 1.0 - smoothstep(0.72, 1.0, length(p));
  int paletteIndex = int(floor(vSeed * float(max(1, uPaletteCount)))) % max(1, uPaletteCount);
  vec3 color = uPalette[paletteIndex];
  outColor = vec4(color * uIntensity * vIntensity, coverage * vAlpha);
  ${extensions.map((entry) => entry.glslRender ?? '').filter(Boolean).join('\n  ')}
}`;
}

function buildWgslSimulation(effect: CompiledParticleEffect2D, extensions: readonly ParticleModuleCompilerExtension2D[], collisions: boolean, turbulence: boolean): string {
  return `struct ParticleA { position: vec2<f32>, age: f32, lifetime: f32 }
struct ParticleB { velocity: vec2<f32>, rotation: f32, angularVelocity: f32 }
struct ParticleC { archetype: f32, generation: f32, colorSeed: f32, flags: f32 }
struct Frame { delta: f32, capacity: u32, viewport: vec2<f32>, commandCount: u32, commandTexels: u32, commandFrameStart: u32, padding: u32 }
@group(0) @binding(0) var<storage, read_write> stateA: array<ParticleA>;
@group(0) @binding(1) var<storage, read_write> stateB: array<ParticleB>;
@group(0) @binding(2) var<storage, read_write> stateC: array<ParticleC>;
@group(0) @binding(3) var<uniform> frame: Frame;
@group(0) @binding(4) var<storage, read> commandData: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read> archetypeMotion: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read> emitterSource: array<vec4<f32>>;
fn hash11(value: f32) -> f32 { return fract(sin(value * 91.3458 + 17.123) * 47453.5453); }
@compute @workgroup_size(256)
fn simulate(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= frame.capacity) { return; }
  if (stateA[i].age < stateA[i].lifetime) {
    let archetype = min(u32(stateC[i].archetype + 0.5), ${Math.max(0, effect.source.archetypes.length - 1)}u);
    let motion = archetypeMotion[archetype];
    stateA[i].age += frame.delta;
    stateB[i].velocity.y += motion.x * frame.delta;
    stateB[i].velocity *= exp(-max(0.0, motion.y) * frame.delta);
    stateB[i].rotation += stateB[i].angularVelocity * frame.delta;
    stateA[i].position += stateB[i].velocity * frame.delta;
    ${collisions ? 'stateA[i].position = clamp(stateA[i].position, vec2<f32>(0.0), frame.viewport);' : ''}
  }
  ${turbulence ? '// Turbulence is generated from the stable color seed in the backend module.' : ''}
  if (frame.commandCount > 0u) {
    var low = 0u; var high = frame.commandCount;
    for (var iteration = 0u; iteration < 6u; iteration++) {
      let middle = (low + high) / 2u;
      if (middle >= frame.commandCount) { high = middle; }
      else if (u32(commandData[middle * frame.commandTexels].y + 0.5) <= i) { low = middle + 1u; }
      else { high = middle; }
    }
    if (low > 0u) {
      let commandIndex = low - 1u; let offset = commandIndex * frame.commandTexels; let a = commandData[offset]; let d = commandData[offset + 3u];
      let start=u32(a.y+0.5);let relative=i-start+u32(d.y+0.5);let count=u32(a.z+0.5);
      if (i >= start && i < start + count) {
      let b = commandData[offset + 1u]; let c = commandData[offset + 2u];
      let seed = d.x + f32(relative) * 1.6180339; let randomA = hash11(seed); let randomB = hash11(seed + 5.0);
      let packedShape=u32(a.w+0.5);let shape=packedShape%32u;let overflowPolicy=packedShape/32u;let emitter = min(u32(d.w + 0.5), ${Math.max(0, effect.source.emitters.length - 1)}u); let source = emitterSource[emitter];
      var angle = c.x + (randomA - 0.5) * c.y; var offsetPosition = vec2<f32>(0.0);
      if (shape == 1u) { let arc=randomA*6.2831853; offsetPosition=vec2<f32>(cos(arc),sin(arc))*sqrt(randomB)*source.x; }
      else if (shape == 2u) { offsetPosition=vec2<f32>(cos(c.x),sin(c.x))*(randomA-0.5)*source.y; }
      else if (shape == 4u || shape == 5u) { angle=c.x+(randomA-0.5)*select(source.z,6.2831853,shape==5u); offsetPosition=vec2<f32>(cos(angle),sin(angle))*source.x; }
      else if (shape == 6u) { angle=c.x+randomA*6.2831853; }
      else if (shape == 7u) { angle=c.x+6.2831853*(f32(relative)/max(1.0,a.z))*max(1.0,source.z/6.2831853)+(randomB-0.5)*c.y; }
      else if (shape == 8u) { angle=c.x+f32(relative%4u)*1.5707963+f32(relative)*0.075+(randomA-0.5)*c.y; }
      else if (shape == 9u) { offsetPosition=vec2<f32>((randomA-0.5)*source.y,0.0); angle=c.x+(randomB-0.5)*c.y; }
      let power = c.z * mix(0.72, 1.28, hash11(seed + 2.0));
      if(overflowPolicy!=1u||stateA[i].age>=stateA[i].lifetime){stateA[i] = ParticleA(b.xy+offsetPosition, 0.0, c.w * mix(max(0.05, 1.0-d.z), 1.0+d.z, hash11(seed+3.0)));
      stateB[i] = ParticleB(b.zw + vec2<f32>(cos(angle), sin(angle)) * power, 0.0, 0.0);
      stateC[i] = ParticleC(a.x, 0.0, hash11(seed+4.0), 0.0);}
      }
    }
  }
  ${extensions.map((entry) => entry.wgslSimulation ?? '').filter(Boolean).join('\n  ')}
}`;
}

function buildWgslEventAppend(effect: CompiledParticleEffect2D): string {
  const branches = compiledEvents(effect).map((entry) => {
    const trigger = wgslEventTrigger(entry);
    const flag = eventFlag(entry.parentSlot);
    const notFired = entry.trigger === 'collision' ? 'true' : `(flags & ${flag}u) == 0u`;
    const mark = entry.trigger === 'collision' ? '' : `flags = flags | ${flag}u;`;
    return `if (archetype == ${entry.parent}u && metadata.generation <= ${glslFloat(entry.maxGeneration)} && ${notFired} && (${trigger})) {
      ${mark}
      if (hash11(f32(i * 31u + ${entry.global}u * 17u)) <= ${glslFloat(entry.probability)}) {
        for (var childOrdinal = 0u; childOrdinal < ${entry.count}u; childOrdinal += 1u) {
          let queueSlot = atomicAdd(&counters.values[${entry.priority}u], 1u);
          let targetSlot = atomicAdd(&counters.values[${3 + entry.child}u], 1u);
          if (queueSlot < frame.capacity) { eventQueue[${entry.priority}u * frame.capacity + queueSlot] = EventRecord(i, ${entry.global}u, targetSlot, childOrdinal); }
        }
      }
    }`;
  }).join('\n  ');
  return `struct ParticleA { position: vec2<f32>, age: f32, lifetime: f32 }
struct ParticleB { velocity: vec2<f32>, rotation: f32, angularVelocity: f32 }
struct ParticleC { archetype: f32, generation: f32, colorSeed: f32, flags: f32 }
struct Frame { delta: f32, capacity: u32, viewport: vec2<f32>, commandCount: u32, commandTexels: u32, commandFrameStart: u32, padding: u32 }
struct EventRecord { parent: u32, eventIndex: u32, targetSlot: u32, childOrdinal: u32 }
struct EventCounters { values: array<atomic<u32>, ${3 + effect.source.archetypes.length}> }
@group(0) @binding(0) var<storage, read_write> stateA: array<ParticleA>;
@group(0) @binding(1) var<storage, read_write> stateB: array<ParticleB>;
@group(0) @binding(2) var<storage, read_write> stateC: array<ParticleC>;
@group(0) @binding(3) var<uniform> frame: Frame;
@group(0) @binding(4) var<storage, read> archetypePools: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> eventQueue: array<EventRecord>;
@group(0) @binding(6) var<storage, read_write> counters: EventCounters;
fn hash11(value: f32) -> f32 { return fract(sin(value * 91.3458 + 17.123) * 47453.5453); }
@compute @workgroup_size(256)
fn appendEvents(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= frame.capacity) { return; }
  let position = stateA[i]; var metadata = stateC[i]; let archetype = u32(metadata.archetype + 0.5); var flags = u32(metadata.flags + 0.5);
  ${branches}
  metadata.flags = f32(flags); stateC[i] = metadata;
}`;
}

function buildWgslEventResolve(effect: CompiledParticleEffect2D): string {
  const branches = compiledEvents(effect).map((entry) => `if (record.eventIndex == ${entry.global}u) { child=${entry.child}u; lifetime=${glslFloat(entry.lifetime)}; inheritance=${glslFloat(entry.inheritance)}; powerScale=${glslFloat(entry.powerScale)}; spread=${glslFloat(entry.spread)}; }`).join('\n  else ');
  return `struct ParticleA { position: vec2<f32>, age: f32, lifetime: f32 }
struct ParticleB { velocity: vec2<f32>, rotation: f32, angularVelocity: f32 }
struct ParticleC { archetype: f32, generation: f32, colorSeed: f32, flags: f32 }
struct Frame { delta: f32, capacity: u32, viewport: vec2<f32>, commandCount: u32, commandTexels: u32, commandFrameStart: u32, padding: u32 }
struct EventRecord { parent: u32, eventIndex: u32, targetSlot: u32, childOrdinal: u32 }
struct EventCounters { values: array<atomic<u32>, ${3 + effect.source.archetypes.length}> }
@group(0) @binding(0) var<storage, read_write> stateA: array<ParticleA>;
@group(0) @binding(1) var<storage, read_write> stateB: array<ParticleB>;
@group(0) @binding(2) var<storage, read_write> stateC: array<ParticleC>;
@group(0) @binding(3) var<uniform> frame: Frame;
@group(0) @binding(4) var<storage, read> archetypePools: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read> eventQueue: array<EventRecord>;
@group(0) @binding(6) var<storage, read_write> counters: EventCounters;
fn hash11(value: f32) -> f32 { return fract(sin(value * 91.3458 + 17.123) * 47453.5453); }
@compute @workgroup_size(256)
fn resolveEvents(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dispatchIndex=gid.x;if(dispatchIndex>=frame.capacity*3u){return;}let priority=dispatchIndex/frame.capacity;let local=dispatchIndex%frame.capacity;
  if(local>=min(atomicLoad(&counters.values[priority]),frame.capacity)){return;}let record=eventQueue[priority*frame.capacity+local];
  var child=0xffffffffu;var lifetime=0.0;var inheritance=0.0;var powerScale=0.0;var spread=6.2831853;
  ${branches}
  if(child==0xffffffffu){return;}let pool=archetypePools[child];let poolCount=max(1u,u32(pool.y+.5));let target=u32(pool.x+.5)+(record.targetSlot%poolCount);
  let overflow=u32(pool.z+.5);if(overflow==1u&&stateA[target].age<stateA[target].lifetime){return;}let parentA=stateA[record.parent];let parentB=stateB[record.parent];let parentC=stateC[record.parent];
  let random=hash11(f32(record.parent*31u+record.childOrdinal*17u+record.eventIndex));let angle=random*spread;let power=max(24.0,length(parentB.velocity))*powerScale;
  stateA[target]=ParticleA(parentA.position,0.0,lifetime);stateB[target]=ParticleB(parentB.velocity*inheritance+vec2<f32>(cos(angle),sin(angle))*power,0.0,0.0);stateC[target]=ParticleC(f32(child),parentC.generation+1.0,parentC.colorSeed+random,0.0);
}`;
}

function wgslEventTrigger(entry: CompiledEventEntry): string {
  if (entry.trigger === 'death') return 'position.age >= position.lifetime && position.age - frame.delta < position.lifetime';
  if (entry.trigger === 'birth') return 'position.age <= frame.delta';
  if (entry.trigger === 'collision') return '(flags & 1u) != 0u';
  return `position.age >= ${glslFloat(entry.delay)} && position.age - frame.delta < ${glslFloat(entry.delay)}`;
}

function buildWgslRender(): string {
  return `struct VertexOut { @builtin(position) position: vec4<f32>, @location(0) age: f32, @location(1) seed: f32 }
@vertex fn particleVertex(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> VertexOut {
  var out: VertexOut;
  let corner = array<vec2<f32>, 6>(vec2(-1.0,-1.0),vec2(1.0,-1.0),vec2(-1.0,1.0),vec2(-1.0,1.0),vec2(1.0,-1.0),vec2(1.0,1.0));
  out.position = vec4<f32>(corner[vertex], 0.0, 1.0);
  out.age = 0.0; out.seed = f32(instance); return out;
}`;
}

function compileRenderPasses(effect: CompiledParticleEffect2D): Readonly<Record<ParticleRenderTier2D, readonly CompiledParticleRenderPass2D[]>> {
  const output = { basic: [] as CompiledParticleRenderPass2D[], enhanced: [] as CompiledParticleRenderPass2D[], ultra: [] as CompiledParticleRenderPass2D[] };
  for (const recipe of effect.source.renderRecipes.recipes) {
    const passes = output[recipe.tier];
    if (recipe.points) passes.push({ id: `${recipe.tier}.points`, tier: recipe.tier, kind: 'points', blend: recipe.blend });
    if (recipe.streaks) passes.push({ id: `${recipe.tier}.streaks`, tier: recipe.tier, kind: 'streaks', blend: recipe.blend });
    if (recipe.trails) passes.push({ id: `${recipe.tier}.trails`, tier: recipe.tier, kind: 'trails', blend: recipe.blend });
    if (recipe.bloom) passes.push({ id: `${recipe.tier}.bloom`, tier: recipe.tier, kind: 'bloom', blend: 'additive' });
  }
  return Object.freeze({ basic: Object.freeze(output.basic), enhanced: Object.freeze(output.enhanced), ultra: Object.freeze(output.ultra) });
}

function baseBindings(targets: 2 | 3, collisions: boolean, events: boolean, extensions: readonly ParticleModuleCompilerExtension2D[]): ParticleShaderBinding2D[] {
  const bindings: ParticleShaderBinding2D[] = [
    { name: 'uPositionState', kind: 'texture', dataType: 'rgba32f', required: true },
    { name: 'uVelocityState', kind: 'texture', dataType: 'rgba32f', required: true },
    { name: 'uDt', kind: 'uniform', dataType: 'f32', required: true },
    { name: 'uCanvasSize', kind: 'uniform', dataType: 'vec2', required: true },
    { name: 'uArchetypeMotion', kind: 'uniform', dataType: 'vec4[]', required: true },
    { name: 'uArchetypeForce', kind: 'uniform', dataType: 'vec4[]', required: true },
    { name: 'uArchetypeCollision', kind: 'uniform', dataType: 'vec4[]', required: collisions },
    { name: 'uEmitterSource', kind: 'uniform', dataType: 'vec4[]', required: true },
    { name: 'uArchetypeSize', kind: 'uniform', dataType: 'vec4[]', required: true },
    { name: 'uArchetypeLength', kind: 'uniform', dataType: 'vec4[]', required: true },
    { name: 'uArchetypeAlpha', kind: 'uniform', dataType: 'vec4[]', required: true },
    { name: 'uArchetypeIntensity', kind: 'uniform', dataType: 'vec4[]', required: true },
    { name: 'uPalette', kind: 'uniform', dataType: 'vec3[8]', required: true },
  ];
  if (targets === 3) bindings.push({ name: 'uMetadataState', kind: 'texture', dataType: 'rgba32f', required: true });
  if (collisions) bindings.push(
    { name: 'uCircleColliders', kind: 'uniform', dataType: 'vec4[16]', required: true },
    { name: 'uCapsuleA', kind: 'uniform', dataType: 'vec4[16]', required: true },
    { name: 'uCapsuleB', kind: 'uniform', dataType: 'vec4[16]', required: true },
  );
  if (events) bindings.push({ name: 'uEventCommands', kind: 'texture', dataType: 'rgba32f', required: false });
  extensions.forEach((extension) => { bindings.push(...(extension.bindings ?? [])); });
  return bindings;
}

function shader(backend: ParticleShaderBackend2D, stage: ParticleShaderStage2D, entryPoint: string, source: string): ParticleCompiledShader2D {
  return Object.freeze({ backend, stage, entryPoint, source, hash: hashSource(source) });
}

function hashSource(source: string): string {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function validateExtensions(extensions: readonly ParticleModuleCompilerExtension2D[]): void {
  const ids = new Set<string>();
  for (const extension of extensions) {
    if (!/^[a-z][a-z0-9-]*$/.test(extension.id) || ids.has(extension.id)) throw new Error(`Invalid or duplicate particle compiler extension: ${extension.id}`);
    if (extension.supports.length === 0) throw new Error(`Particle compiler extension ${extension.id} declares no compatible backend`);
    if (extension.supports.includes('webgl2') && !extension.glslSimulation && !extension.glslRender) throw new Error(`Particle compiler extension ${extension.id} is missing its GLSL implementation`);
    if (extension.supports.includes('webgpu') && !extension.wgslSimulation) throw new Error(`Particle compiler extension ${extension.id} is missing its WGSL implementation`);
    ids.add(extension.id);
  }
}

function validateRequiredExtensions(effect: CompiledParticleEffect2D, extensions: readonly ParticleModuleCompilerExtension2D[]): void {
  const available = new Map(extensions.map((extension) => [extension.id, extension]));
  for (const id of effect.source.customModules ?? []) {
    const extension = available.get(id);
    if (!extension) throw new Error(`Particle effect ${effect.source.id} requires unregistered compiler extension ${id}`);
    if (!extension.supports.includes('webgl2') && effect.fallbackPolicy === 'webgl2') throw new Error(`Particle extension ${id} cannot satisfy the WebGL2 fallback policy`);
  }
}

function wgslFloat(value: number): string { return Number.isInteger(value) ? `${value}.0` : String(value); }
