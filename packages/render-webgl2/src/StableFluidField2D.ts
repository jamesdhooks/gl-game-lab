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
}
export interface StableFluidStepOptions {
  readonly deltaSeconds: number;
  readonly viscosity: number;
  readonly curl: number;
  readonly velocityDissipation: number;
  readonly dyeDissipation: number;
  readonly pressureIterations: number;
  readonly ambient?: boolean;
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
    this.velocity = new GpuFieldState(gl, {
      ...options,
      precision: 'half-float',
      filter: 'linear'
    });
    this.dye = new GpuFieldState(gl, {
      ...options,
      precision: 'half-float',
      filter: 'linear'
    });
    this.pressure = new GpuFieldState(gl, {
      ...options,
      precision: 'half-float',
      filter: 'linear'
    });
    this.divergence = new GpuFieldState(gl, {
      ...options,
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
    const dt = Math.max(0, Math.min(1 / 30, options.deltaSeconds)), texelX = 1 / this.width, texelY = 1 / this.height;
    this.velocityPass.step(this.velocity, (g, u) => {
      g.uniform2f(u('uTexel'), texelX, texelY);
      g.uniform1f(u('uDt'), dt);
      g.uniform1f(u('uDecay'), Math.max(0, 1 - options.velocityDissipation * dt));
      g.uniform1f(u('uViscosity'), options.viscosity);
      g.uniform1f(u('uCurl'), options.curl);
      g.uniform1f(u('uAmbient'), options.ambient ? 1 : 0);
    });
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
      this.applySplat(this.velocity, splat, [
        splat.velocityX,
        splat.velocityY,
        0,
        0
      ]);
      this.applySplat(this.dye, splat, [
        splat.dye[0] * splat.amount,
        splat.dye[1] * splat.amount,
        splat.dye[2] * splat.amount,
        splat.amount
      ]);
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
  ]) {
    this.splatPass.step(state, (g, u) => {
      g.uniform2f(u('uPoint'), splat.x, splat.y);
      g.uniform1f(u('uRadius'), splat.radius);
      g.uniform4f(u('uValue'), value[0], value[1], value[2], value[3]);
    });
  }
  private assert() {
    if (this.disposed)
      throw new Error('Stable fluid field has been disposed');
  }
}
const HEAD = `#version 300 es\nprecision highp float;in vec2 vUv;uniform sampler2D uFieldState;uniform vec2 uFieldSize;out vec4 outColor;`;
const VELOCITY = HEAD + `uniform vec2 uTexel;uniform float uDt,uDecay,uViscosity,uCurl,uAmbient;void main(){vec2 v=texture(uFieldState,vUv).xy;vec2 uv=clamp(vUv-v*uDt,vec2(0),vec2(1));vec2 adv=texture(uFieldState,uv).xy;float cL=texture(uFieldState,vUv-vec2(uTexel.x,0)).y-texture(uFieldState,vUv-vec2(uTexel.x,0)).x;float cR=texture(uFieldState,vUv+vec2(uTexel.x,0)).y-texture(uFieldState,vUv+vec2(uTexel.x,0)).x;float cB=texture(uFieldState,vUv-vec2(0,uTexel.y)).y-texture(uFieldState,vUv-vec2(0,uTexel.y)).x;float cT=texture(uFieldState,vUv+vec2(0,uTexel.y)).y-texture(uFieldState,vUv+vec2(0,uTexel.y)).x;vec2 vort=normalize(vec2(abs(cT)-abs(cB),abs(cR)-abs(cL))+vec2(1e-5))*vec2(1,-1)*uCurl*.00008;vec2 ambient=vec2(sin(vUv.y*13.0),cos(vUv.x*11.0))*uAmbient*.0008;outColor=vec4((mix(adv,v,uViscosity*.04)+vort+ambient)*uDecay,0,1);}`;
const DYE = HEAD + `uniform sampler2D uVelocity;uniform float uDt,uDecay;void main(){vec2 v=texture(uVelocity,vUv).xy;outColor=texture(uFieldState,clamp(vUv-v*uDt,vec2(0),vec2(1)))*uDecay;}`;
const DIVERGENCE = HEAD + `uniform sampler2D uVelocity;uniform vec2 uTexel;void main(){float l=texture(uVelocity,vUv-vec2(uTexel.x,0)).x,r=texture(uVelocity,vUv+vec2(uTexel.x,0)).x,b=texture(uVelocity,vUv-vec2(0,uTexel.y)).y,t=texture(uVelocity,vUv+vec2(0,uTexel.y)).y;outColor=vec4(.5*(r-l+t-b),0,0,1);}`;
const PRESSURE = HEAD + `uniform sampler2D uDivergence;uniform vec2 uTexel;void main(){float l=texture(uFieldState,vUv-vec2(uTexel.x,0)).x,r=texture(uFieldState,vUv+vec2(uTexel.x,0)).x,b=texture(uFieldState,vUv-vec2(0,uTexel.y)).x,t=texture(uFieldState,vUv+vec2(0,uTexel.y)).x,d=texture(uDivergence,vUv).x;outColor=vec4((l+r+b+t-d)*.25,0,0,1);}`;
const GRADIENT = HEAD + `uniform sampler2D uPressure;uniform vec2 uTexel;void main(){float l=texture(uPressure,vUv-vec2(uTexel.x,0)).x,r=texture(uPressure,vUv+vec2(uTexel.x,0)).x,b=texture(uPressure,vUv-vec2(0,uTexel.y)).x,t=texture(uPressure,vUv+vec2(0,uTexel.y)).x;vec2 v=texture(uFieldState,vUv).xy-vec2(r-l,t-b)*.5;outColor=vec4(v,0,1);}`;
const SPLAT = HEAD + `uniform vec2 uPoint;uniform float uRadius;uniform vec4 uValue;void main(){vec4 base=texture(uFieldState,vUv);vec2 d=vUv-uPoint;float influence=exp(-dot(d,d)/max(1e-6,uRadius*uRadius));outColor=base+uValue*influence;}`;
const SEED = HEAD + `uniform int uKind;uniform float uSeed;float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+uSeed)*43758.5453);}void main(){vec2 p=vUv-.5;float cloud=exp(-dot(p,p)*4.0)*(.5+.5*sin(vUv.x*18.0+sin(vUv.y*13.0+uSeed)));float cells=pow(h(floor(vUv*10.0)),2.0);float random=h(floor(vUv*uFieldSize));float v=uKind==0?cloud:uKind==1?cells:random*.65;outColor=vec4(v,h(vUv+3.1)*v,h(vUv+7.7)*v,v);}`;
const DISPLAY = HEAD + `uniform vec3 uPalette[4],uBackground;uniform int uPaletteCount;uniform vec2 uTexel;uniform float uShading,uSunrays,uExposure;void main(){vec3 dye=max(vec3(0),texture(uFieldState,vUv).rgb);float density=max(dye.r,max(dye.g,dye.b));vec3 weights=dye/(density+.0001);vec3 color=uPalette[0]*weights.r+uPalette[min(1,uPaletteCount-1)]*weights.g+uPalette[min(2,uPaletteCount-1)]*weights.b;float l=length(texture(uFieldState,vUv-vec2(uTexel.x,0)).rgb),r=length(texture(uFieldState,vUv+vec2(uTexel.x,0)).rgb),b=length(texture(uFieldState,vUv-vec2(0,uTexel.y)).rgb),t=length(texture(uFieldState,vUv+vec2(0,uTexel.y)).rgb);vec3 normal=normalize(vec3((l-r)*uShading,(b-t)*uShading,1));float light=.56+.44*max(0.0,dot(normal,normalize(vec3(-.4,.55,1))));vec2 ray=(vec2(.5)-vUv)/8.0;float rays=0.0;for(int i=0;i<8;i++)rays+=length(texture(uFieldState,vUv+ray*float(i)).rgb);rays*=.0125*uSunrays;color=color*light+rays*uPalette[min(3,uPaletteCount-1)];float alpha=1.0-exp(-density*1.4);outColor=vec4(mix(uBackground,color*uExposure,alpha),1);}`;
