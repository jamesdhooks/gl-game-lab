import { GpuFieldPass } from './GpuFieldPass.js';
import { GpuFieldState } from './GpuFieldState.js';
import type { GpuParticleRenderDestination } from './GpuParticleRenderer.js';
export interface FluidSplat2D {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly dye: readonly [
    number,
    number,
    number
  ];
  readonly amount: number;
  readonly previousX?: number;
  readonly previousY?: number;
  readonly taper?: number;
  readonly aspectRatio?: number;
  readonly strength?: number;
  readonly velocityMode?: 'add' | 'target';
}
export interface StableFluidStepOptions {
  readonly deltaSeconds: number;
  readonly viscosity: number;
  readonly curl: number;
  readonly velocityDissipation: number;
  readonly dyeDissipation: number;
  readonly pressureIterations: number;
  readonly ambient?: boolean;
  readonly velocitySplatsBeforeProjection?: boolean;
}
export interface StableFluidDisplayOptions {
  readonly palette: readonly (readonly [
    number,
    number,
    number
  ])[];
  readonly background: readonly [
    number,
    number,
    number
  ];
  readonly shadingStrength: number;
  readonly sunraysStrength: number;
  readonly exposure?: number;
}
export interface StableFluidField2DOptions {
  readonly width: number;
  readonly height: number;
  readonly simulationWidth?: number;
  readonly simulationHeight?: number;
}
export class StableFluidField2D {
  readonly velocity: GpuFieldState;
  readonly dye: GpuFieldState;
  readonly pressure: GpuFieldState;
  readonly divergence: GpuFieldState;
  private readonly velocityPass: GpuFieldPass;
  private readonly dyePass: GpuFieldPass;
  private readonly divergencePass: GpuFieldPass;
  private readonly pressurePass: GpuFieldPass;
  private readonly gradientPass: GpuFieldPass;
  private readonly splatPass: GpuFieldPass;
  private readonly seedPass: GpuFieldPass;
  private readonly displayPass: GpuFieldPass;
  private disposed = false;
  constructor(private readonly gl: WebGL2RenderingContext, options: StableFluidField2DOptions) {
    const simulation = { width: options.simulationWidth ?? options.width, height: options.simulationHeight ?? options.height };
    this.velocity = new GpuFieldState(gl, {
      ...simulation,
      precision: 'half-float',
      filter: 'linear'
    });
    this.dye = new GpuFieldState(gl, {
      width: options.width, height: options.height,
      precision: 'half-float',
      filter: 'linear'
    });
    this.pressure = new GpuFieldState(gl, {
      ...simulation,
      precision: 'half-float',
      filter: 'linear'
    });
    this.divergence = new GpuFieldState(gl, {
      ...simulation,
      precision: 'half-float',
      filter: 'nearest'
    });
    this.velocityPass = new GpuFieldPass(gl, VELOCITY);
    this.dyePass = new GpuFieldPass(gl, DYE);
    this.divergencePass = new GpuFieldPass(gl, DIVERGENCE);
    this.pressurePass = new GpuFieldPass(gl, PRESSURE);
    this.gradientPass = new GpuFieldPass(gl, GRADIENT);
    this.splatPass = new GpuFieldPass(gl, SPLAT);
    this.seedPass = new GpuFieldPass(gl, SEED);
    this.displayPass = new GpuFieldPass(gl, DISPLAY);
  }
  get width() {
    return this.dye.width;
  }
  get height() {
    return this.dye.height;
  }
  clear() {
    this.assert();
    this.velocity.clear();
    this.dye.clear();
    this.pressure.clear();
    this.divergence.clear();
  }
  uploadDyeRgba(values: Float32Array): void {
    const length = this.width * this.height * 4;
    if (values.length !== length) throw new Error('Fluid dye upload length does not match field dimensions');
    const gl = this.gl;
    for (const target of [this.dye.targets.read, this.dye.targets.write]) {
      gl.bindTexture(gl.TEXTURE_2D, target.texture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, gl.RGBA, gl.FLOAT, values);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  seed(kind: 'cloud' | 'voronoi' | 'random' | 'blank', seed: number) {
    this.assert();
    this.clear();
    if (kind === 'blank')
      return;
    this.seedPass.step(this.dye, (g, u) => {
      g.uniform1i(u('uKind'), kind === 'voronoi' ? 1 : kind === 'random' ? 2 : 0);
      g.uniform1f(u('uSeed'), seed);
    });
  }
  step(options: StableFluidStepOptions, splats: readonly FluidSplat2D[] = []) {
    this.assert();
    const dt = Math.max(0, Math.min(1 / 30, options.deltaSeconds)), texelX = 1 / this.velocity.width, texelY = 1 / this.velocity.height;
    this.velocityPass.step(this.velocity, (g, u) => {
      g.uniform2f(u('uTexel'), texelX, texelY);
      g.uniform1f(u('uDt'), dt);
      g.uniform1f(u('uDecay'), Math.max(0, 1 - options.velocityDissipation * dt));
      g.uniform1f(u('uViscosity'), options.viscosity);
      g.uniform1f(u('uCurl'), options.curl);
      g.uniform1f(u('uAmbient'), options.ambient ? 1 : 0);
    });
    if (options.velocitySplatsBeforeProjection)
      for (const splat of splats) this.applySplat(this.velocity, splat, [splat.velocityX, splat.velocityY, 0, 0], splat.velocityMode === 'target');
    this.divergencePass.step(this.divergence, (g, u) => {
      this.velocity.targets.read.attach(1);
      g.uniform1i(u('uVelocity'), 1);
      g.uniform2f(u('uTexel'), texelX, texelY);
    });
    this.pressure.clear();
    const iterations = Math.max(1, Math.min(48, Math.floor(options.pressureIterations)));
    for (let i = 0; i < iterations; i++)
      this.pressurePass.step(this.pressure, (g, u) => {
        this.divergence.targets.read.attach(1);
        g.uniform1i(u('uDivergence'), 1);
        g.uniform2f(u('uTexel'), texelX, texelY);
      });
    this.gradientPass.step(this.velocity, (g, u) => {
      this.pressure.targets.read.attach(1);
      g.uniform1i(u('uPressure'), 1);
      g.uniform2f(u('uTexel'), texelX, texelY);
    });
    this.dyePass.step(this.dye, (g, u) => {
      this.velocity.targets.read.attach(1);
      g.uniform1i(u('uVelocity'), 1);
      g.uniform1f(u('uDt'), dt);
      g.uniform1f(u('uDecay'), Math.max(0, 1 - options.dyeDissipation * dt));
    });
    for (const splat of splats) {
      if (!options.velocitySplatsBeforeProjection) this.applySplat(this.velocity, splat, [
        splat.velocityX, splat.velocityY, 0, 0
      ], splat.velocityMode === 'target');
      this.applySplat(this.dye, splat, [
        splat.dye[0] * splat.amount,
        splat.dye[1] * splat.amount,
        splat.dye[2] * splat.amount,
        splat.amount
      ], false);
    }
  }
  render(destination: GpuParticleRenderDestination, options: StableFluidDisplayOptions) {
    this.assert();
    if (options.palette.length < 1 || options.palette.length > 4)
      throw new Error('Fluid palette must contain between one and four colors');
    const palette = new Float32Array(12);
    options.palette.forEach((color, index) => palette.set(color, index * 3));
    this.displayPass.render(this.dye, destination, (g, u) => {
      g.uniform3fv(u('uPalette[0]'), palette);
      g.uniform1i(u('uPaletteCount'), options.palette.length);
      g.uniform3fv(u('uBackground'), new Float32Array(options.background));
      g.uniform2f(u('uTexel'), 1 / this.width, 1 / this.height);
      g.uniform1f(u('uShading'), options.shadingStrength);
      g.uniform1f(u('uSunrays'), options.sunraysStrength);
      g.uniform1f(u('uExposure'), options.exposure ?? 1);
    });
  }
  dispose() {
    if (this.disposed)
      return;
    this.disposed = true;
    for (const value of [
      this.velocity,
      this.dye,
      this.pressure,
      this.divergence
    ])
      value.dispose();
    for (const pass of [
      this.velocityPass,
      this.dyePass,
      this.divergencePass,
      this.pressurePass,
      this.gradientPass,
      this.splatPass,
      this.seedPass,
      this.displayPass
    ])
      pass.dispose();
  }
  private applySplat(state: GpuFieldState, splat: FluidSplat2D, value: readonly [
    number,
    number,
    number,
    number
  ], target: boolean) {
    this.splatPass.step(state, (g, u) => {
      g.uniform2f(u('uPoint'), splat.x, splat.y);
      g.uniform1f(u('uRadius'), splat.radius);
      g.uniform4f(u('uValue'), value[0], value[1], value[2], value[3]);
      g.uniform2f(u('uPrevious'), splat.previousX ?? splat.x, splat.previousY ?? splat.y);
      g.uniform1f(u('uSegment'), splat.previousX === undefined || splat.previousY === undefined ? 0 : 1);
      g.uniform1f(u('uTaper'), splat.taper ?? 0);
      g.uniform1f(u('uAspect'), splat.aspectRatio ?? 1);
      g.uniform1f(u('uStrength'), splat.strength ?? 1);
      g.uniform1f(u('uTargetBlend'), target ? 1 : 0);
    });
  }
  private assert() {
    if (this.disposed)
      throw new Error('Stable fluid field has been disposed');
  }
}
const HEAD = `#version 300 es\nprecision highp float;in vec2 vUv;uniform sampler2D uFieldState;uniform vec2 uFieldSize;out vec4 outColor;`;
const VELOCITY = HEAD + `uniform vec2 uTexel;uniform float uDt,uDecay,uViscosity,uCurl,uAmbient;void main(){vec2 v=texture(uFieldState,vUv).xy;vec2 uv=clamp(vUv-v*uDt,vec2(0),vec2(1));vec2 adv=texture(uFieldState,uv).xy;float cL=texture(uFieldState,vUv-vec2(uTexel.x,0)).y-texture(uFieldState,vUv-vec2(uTexel.x,0)).x;float cR=texture(uFieldState,vUv+vec2(uTexel.x,0)).y-texture(uFieldState,vUv+vec2(uTexel.x,0)).x;float cB=texture(uFieldState,vUv-vec2(0,uTexel.y)).y-texture(uFieldState,vUv-vec2(0,uTexel.y)).x;float cT=texture(uFieldState,vUv+vec2(0,uTexel.y)).y-texture(uFieldState,vUv+vec2(0,uTexel.y)).x;vec2 gradient=vec2(abs(cT)-abs(cB),abs(cR)-abs(cL));vec2 vort=gradient/(length(gradient)+1e-5)*vec2(1,-1)*uCurl*.00008;vec2 ambient=vec2(sin(vUv.y*13.0),cos(vUv.x*11.0))*uAmbient*.0008;vec2 result=(mix(adv,v,uViscosity*.04)+vort+ambient)*uDecay;if(vUv.x<uTexel.x||vUv.x>1.0-uTexel.x)result.x=0.0;if(vUv.y<uTexel.y||vUv.y>1.0-uTexel.y)result.y=0.0;outColor=vec4(result,0,1);}`;
const DYE = HEAD + `uniform sampler2D uVelocity;uniform float uDt,uDecay;void main(){vec2 v=texture(uVelocity,vUv).xy;outColor=texture(uFieldState,clamp(vUv-v*uDt,vec2(0),vec2(1)))*uDecay;}`;
const DIVERGENCE = HEAD + `uniform sampler2D uVelocity;uniform vec2 uTexel;void main(){float l=texture(uVelocity,vUv-vec2(uTexel.x,0)).x,r=texture(uVelocity,vUv+vec2(uTexel.x,0)).x,b=texture(uVelocity,vUv-vec2(0,uTexel.y)).y,t=texture(uVelocity,vUv+vec2(0,uTexel.y)).y;outColor=vec4(.5*(r-l+t-b),0,0,1);}`;
const PRESSURE = HEAD + `uniform sampler2D uDivergence;uniform vec2 uTexel;void main(){float l=texture(uFieldState,vUv-vec2(uTexel.x,0)).x,r=texture(uFieldState,vUv+vec2(uTexel.x,0)).x,b=texture(uFieldState,vUv-vec2(0,uTexel.y)).x,t=texture(uFieldState,vUv+vec2(0,uTexel.y)).x,d=texture(uDivergence,vUv).x;outColor=vec4((l+r+b+t-d)*.25,0,0,1);}`;
const GRADIENT = HEAD + `uniform sampler2D uPressure;uniform vec2 uTexel;void main(){float l=texture(uPressure,vUv-vec2(uTexel.x,0)).x,r=texture(uPressure,vUv+vec2(uTexel.x,0)).x,b=texture(uPressure,vUv-vec2(0,uTexel.y)).x,t=texture(uPressure,vUv+vec2(0,uTexel.y)).x;vec2 v=texture(uFieldState,vUv).xy-vec2(r-l,t-b)*.5;outColor=vec4(v,0,1);}`;
const SPLAT = HEAD + `uniform vec2 uPoint,uPrevious;uniform float uRadius,uSegment,uTaper,uAspect,uStrength,uTargetBlend;uniform vec4 uValue;vec2 segmentDistance(vec2 p,vec2 a,vec2 b){vec2 ab=b-a;float lengthSquared=max(1e-8,dot(ab,ab));float fraction=dot(p-a,ab)/lengthSquared;vec2 closest=a+ab*clamp(fraction,0.0,1.0);vec2 delta=p-closest;delta.x*=uAspect;return vec2(length(delta),fraction);}void main(){vec4 base=texture(uFieldState,vUv);vec2 pointDelta=vUv-uPoint;pointDelta.x*=uAspect;float pointInfluence=exp(-dot(pointDelta,pointDelta)/max(1e-6,uRadius*uRadius));vec2 distanceAndFraction=segmentDistance(vUv,uPoint,uPrevious);float projected=1.0-clamp(distanceAndFraction.y,0.0,1.0)*uTaper;float segmentInfluence=exp(-distanceAndFraction.x/max(1e-6,uRadius))*projected*projected;float influence=mix(pointInfluence,segmentInfluence,uSegment)*uStrength;vec4 added=base+uValue*influence;vec4 targeted=base+(uValue-base)*influence;outColor=mix(added,targeted,uTargetBlend);}`;
const SEED = HEAD + `uniform int uKind;uniform float uSeed;float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+uSeed)*43758.5453);}void main(){vec2 p=vUv-.5;float cloud=exp(-dot(p,p)*4.0)*(.5+.5*sin(vUv.x*18.0+sin(vUv.y*13.0+uSeed)));float cells=pow(h(floor(vUv*10.0)),2.0);float random=h(floor(vUv*uFieldSize));float v=uKind==0?cloud:uKind==1?cells:random*.65;outColor=vec4(v,h(vUv+3.1)*v,h(vUv+7.7)*v,v);}`;
const DISPLAY = HEAD + `uniform vec3 uPalette[4],uBackground;uniform int uPaletteCount;uniform vec2 uTexel;uniform float uShading,uSunrays,uExposure;vec3 paletteColor(float t){float scaled=clamp(t,0.0,.999)*float(max(1,uPaletteCount-1)),local=fract(scaled);int index=int(floor(scaled));vec3 a=uPalette[0],b=uPalette[0];for(int i=0;i<4;i++){if(i==index)a=uPalette[i];if(i==min(index+1,uPaletteCount-1))b=uPalette[i];}return mix(a,b,smoothstep(0.0,1.0,local));}void main(){vec3 dye=max(vec3(0),texture(uFieldState,vUv).rgb);float density=max(dye.r,max(dye.g,dye.b));float l=length(texture(uFieldState,vUv-vec2(uTexel.x,0)).rgb),r=length(texture(uFieldState,vUv+vec2(uTexel.x,0)).rgb),b=length(texture(uFieldState,vUv-vec2(0,uTexel.y)).rgb),t=length(texture(uFieldState,vUv+vec2(0,uTexel.y)).rgb);vec3 normal=normalize(vec3((r-l)*1.8,(t-b)*1.8,.08));float diffuse=.52+.48*dot(normal,normalize(vec3(-.35,-.52,.78)));vec3 color=dye*mix(1.0,clamp(diffuse,.62,1.38),clamp(uShading,0.0,1.0));vec3 glow=texture(uFieldState,vUv+vec2(2,0)*uTexel).rgb+texture(uFieldState,vUv-vec2(2,0)*uTexel).rgb+texture(uFieldState,vUv+vec2(0,2)*uTexel).rgb+texture(uFieldState,vUv-vec2(0,2)*uTexel).rgb;color+=glow*.075;vec2 ray=(vec2(.5)-vUv)/8.0;float rays=0.0;for(int i=0;i<8;i++)rays+=length(texture(uFieldState,vUv+ray*float(i)).rgb);color+=paletteColor(clamp(density*.35,0.0,1.0))*rays*.0125*uSunrays;color*=1.0+smoothstep(.006,.13,density)*.22;color=1.0-exp(-color*uExposure*(1.16+density*.22));color=pow(max(color,vec3(0)),vec3(.82));float edge=min(min(vUv.x,1.0-vUv.x),min(vUv.y,1.0-vUv.y)),wall=smoothstep(0.0,.035,edge),vignette=smoothstep(.92,.20,distance(vUv,vec2(.5)));color*=.78+.22*wall;color*=.82+.18*vignette;float alpha=smoothstep(.0015,.075,density);outColor=vec4(mix(uBackground,color,alpha),1);}`;
