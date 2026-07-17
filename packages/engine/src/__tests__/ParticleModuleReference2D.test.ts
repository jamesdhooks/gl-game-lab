import { describe,expect,it } from 'vitest';
import { allocateParticleEventClaims2D, applyParticleDomainReference2D, collideCapsuleReference2D, collideCircleReference2D, evaluateParticleScalarCurve2D, integrateParticleReference2D, sampleParticleSpawnReference2D } from '../index.js';

describe('ParticleModuleReference2D',()=>{
  it('integrates gravity, drag, radial force, and rotation deterministically',()=>{const state={x:0,y:0,vx:10,vy:0,age:0,lifetime:2,rotation:0,angularVelocity:2};integrateParticleReference2D(state,{gravity:10,drag:0,radialAcceleration:5,tangentialAcceleration:0},1,{x:10,y:0,strength:1});expect(state).toMatchObject({x:15,y:10,age:1,rotation:2});});
  it('applies drag before forces and evaluates angular velocity and turbulence for both backend references',()=>{
    const base={x:2,y:3,vx:10,vy:0,age:0,lifetime:2,rotation:0,angularVelocity:1};
    const webgl={...base},webgpu={...base};
    const motion={gravity:0,drag:Math.log(2),turbulence:4,angularVelocity:2};
    integrateParticleReference2D(webgl,motion,1,undefined,{colorSeed:.25,turbulenceBackend:'webgl2'});
    integrateParticleReference2D(webgpu,motion,1,undefined,{colorSeed:.25,turbulenceBackend:'webgpu'});
    expect(webgl.rotation).toBe(3);expect(webgpu.rotation).toBe(3);
    expect(Math.hypot(webgl.vx-5,webgl.vy)).toBeCloseTo(4);
    expect(Math.hypot(webgpu.vx-5,webgpu.vy)).toBeCloseTo(4);
  });
  it('supports softened, repulsive, and tangential dynamic attractors',()=>{const state={x:5,y:0,vx:0,vy:0,age:0,lifetime:2,rotation:0,angularVelocity:0};integrateParticleReference2D(state,{gravity:0,drag:0,radialAcceleration:10,tangentialAcceleration:2,radialFalloff:'inverse'},1,{x:0,y:0,strength:-2,softening:10,tangentialStrength:3});expect(state.vx).toBeCloseTo(2);expect(state.vy).toBeCloseTo(.1);});
  it('applies finite smooth velocity fields and clamps speed',()=>{const state={x:5,y:0,vx:0,vy:0,age:0,lifetime:2,rotation:0,angularVelocity:0};integrateParticleReference2D(state,{gravity:0,drag:0,radialAcceleration:0,tangentialAcceleration:0,maxSpeed:4},1,{x:0,y:0,strength:0,radius:10,envelope:'linear',velocity:[20,0],velocityCoupling:1});expect(state.vx).toBe(4);expect(state.x).toBe(9);});
  it('supports circular wrap and rectangular kill domains',()=>{const wrapped={x:12,y:0,vx:2,vy:0,age:0,lifetime:2,rotation:0,angularVelocity:0};applyParticleDomainReference2D(wrapped,{revision:1,shape:'circle',behavior:'wrap',center:[0,0],radius:10,damping:.5});expect(wrapped).toMatchObject({x:-10,vx:1});const killed={...wrapped,x:6,y:0,age:0};applyParticleDomainReference2D(killed,{revision:2,shape:'rectangle',behavior:'kill',center:[0,0],halfExtents:[5,5]});expect(killed.age).toBe(2);});
  it('samples every built-in distribution without non-finite output',()=>{for(const shape of ['point','disc','line','cone','arc','ring','radial','spiral','pinwheel','shower','annulus'] as const)expect(Object.values(sampleParticleSpawnReference2D(shape,2,8,.25,.75,20,10,Math.PI,0,1)).every(Number.isFinite)).toBe(true);});
  it('resolves circle and capsule contacts including kill mode',()=>{
    const profile={restitution:1,friction:0};
    const circle={x:2,y:0,vx:-2,vy:0,age:0,lifetime:2,rotation:0,angularVelocity:0};
    expect(collideCircleReference2D(circle,{x:0,y:0,radius:4},profile)).toBe(true);expect(circle.vx).toBe(2);
    const capsule={x:5,y:1,vx:0,vy:-1,age:0,lifetime:2,rotation:0,angularVelocity:0};
    expect(collideCapsuleReference2D(capsule,{ax:0,ay:0,bx:10,by:0,radius:2,mode:'kill'},profile)).toBe(true);
    expect(capsule.age).toBe(2);
  });
  it('evaluates curves and resolves event contention by priority then parent',()=>{expect(evaluateParticleScalarCurve2D({start:0,end:10,exponent:2},.5)).toBe(2.5);expect([...allocateParticleEventClaims2D([{target:1,priority:1,parent:4},{target:1,priority:2,parent:2},{target:1,priority:2,parent:5}],4)]).toEqual([-1,5,-1,-1]);});
});
