import type { ParticleCollisionProfile2D, ParticleMotionProfile2D, ParticleScalarCurve2D, ParticleSpawnShape2D } from './ParticleEffects2D.js';
import type { ParticleCapsuleCollider2D, ParticleCircleCollider2D } from './ParticleEffectRuntime2D.js';

export interface ParticleReferenceState2D { x: number; y: number; vx: number; vy: number; age: number; lifetime: number; rotation: number; angularVelocity: number }
export interface ParticleReferenceSpawn2D { readonly x: number; readonly y: number; readonly angle: number }

export function integrateParticleReference2D(state: ParticleReferenceState2D, motion: ParticleMotionProfile2D, delta: number, attractor?: ParticleCircleCollider2D): void {
  state.age += delta;
  state.vy += motion.gravity * delta;
  if (attractor && ((motion.radialAcceleration ?? 0) !== 0 || (motion.tangentialAcceleration ?? 0) !== 0)) {
    const dx=attractor.x-state.x, dy=attractor.y-state.y, length=Math.max(1,Math.hypot(dx,dy)), nx=dx/length, ny=dy/length;
    state.vx += (nx*(motion.radialAcceleration ?? 0)-ny*(motion.tangentialAcceleration ?? 0))*delta;
    state.vy += (ny*(motion.radialAcceleration ?? 0)+nx*(motion.tangentialAcceleration ?? 0))*delta;
  }
  const damping=Math.exp(-Math.max(0,motion.drag)*delta); state.vx*=damping; state.vy*=damping;
  state.rotation += state.angularVelocity*delta; state.x += state.vx*delta; state.y += state.vy*delta;
}

export function sampleParticleSpawnReference2D(shape: ParticleSpawnShape2D, index: number, count: number, randomA: number, randomB: number, radius: number, length: number, arc: number, direction: number, spread: number): ParticleReferenceSpawn2D {
  let angle=direction+(randomA-0.5)*spread, x=0, y=0;
  if(shape==='disc'){const a=randomA*Math.PI*2,r=Math.sqrt(randomB)*radius;x=Math.cos(a)*r;y=Math.sin(a)*r;}
  else if(shape==='line'){x=Math.cos(direction)*(randomA-0.5)*length;y=Math.sin(direction)*(randomA-0.5)*length;}
  else if(shape==='arc'||shape==='ring'){angle=direction+(randomA-0.5)*(shape==='ring'?Math.PI*2:arc);x=Math.cos(angle)*radius;y=Math.sin(angle)*radius;}
  else if(shape==='radial')angle=direction+randomA*Math.PI*2;
  else if(shape==='spiral')angle=direction+Math.PI*2*(index/Math.max(1,count))*Math.max(1,arc/(Math.PI*2))+(randomB-0.5)*spread;
  else if(shape==='pinwheel')angle=direction+(index%4)*Math.PI*0.5+index*0.075+(randomA-0.5)*spread;
  else if(shape==='shower'){x=(randomA-0.5)*length;angle=direction+(randomB-0.5)*spread;}
  return Object.freeze({x,y,angle});
}

export function collideCircleReference2D(state: ParticleReferenceState2D, collider: ParticleCircleCollider2D, profile: ParticleCollisionProfile2D): boolean {
  const dx=state.x-collider.x,dy=state.y-collider.y,distance=Math.hypot(dx,dy); if(distance>=collider.radius)return false;
  if(collider.mode==='kill'){state.age=state.lifetime;return true;}
  const nx=distance>1e-6?dx/distance:0,ny=distance>1e-6?dy/distance:-1,dot=state.vx*nx+state.vy*ny;
  state.x=collider.x+nx*collider.radius;state.y=collider.y+ny*collider.radius;
  state.vx=(state.vx-nx*(1+profile.restitution)*dot)*(1-profile.friction);state.vy=(state.vy-ny*(1+profile.restitution)*dot)*(1-profile.friction);
  state.age+=state.lifetime*(profile.lifetimeLoss??0);return true;
}

export function collideCapsuleReference2D(state: ParticleReferenceState2D, collider: ParticleCapsuleCollider2D, profile: ParticleCollisionProfile2D): boolean {
  const abx=collider.bx-collider.ax,aby=collider.by-collider.ay,denominator=Math.max(1e-8,abx*abx+aby*aby);
  const t=Math.max(0,Math.min(1,((state.x-collider.ax)*abx+(state.y-collider.ay)*aby)/denominator));
  return collideCircleReference2D(state,{x:collider.ax+abx*t,y:collider.ay+aby*t,radius:collider.radius,...(collider.mode?{mode:collider.mode}:{})},profile);
}

export function evaluateParticleScalarCurve2D(curve: ParticleScalarCurve2D, age: number): number { return curve.start+(curve.end-curve.start)*Math.pow(Math.max(0,Math.min(1,age)),curve.exponent??1); }

export function allocateParticleEventClaims2D(claims: readonly { readonly target: number; readonly priority: number; readonly parent: number }[], capacity: number): Int32Array {
  const winners=new Int32Array(capacity);winners.fill(-1);const ranks=new Float64Array(capacity);ranks.fill(-1);
  for(const claim of claims){if(claim.target<0||claim.target>=capacity)continue;const rank=claim.priority*(capacity+1)+claim.parent;if(rank>ranks[claim.target]!){ranks[claim.target]=rank;winners[claim.target]=claim.parent;}}
  return winners;
}
