import { GpuFieldPass } from './GpuFieldPass.js';
import { GpuFieldState } from './GpuFieldState.js';
import type { GpuParticleRenderDestination } from './GpuParticleRenderer.js';
import {
  FLUID_ADVECTION_SHADER,
  FLUID_BOUNDARY_SHADER,
  FLUID_BLOOM_BLUR_SHADER,
  FLUID_BLOOM_FINAL_SHADER,
  FLUID_BLOOM_PREFILTER_SHADER,
  FLUID_BLUR_SHADER,
  FLUID_COMPOSITE_SHADER,
  FLUID_CURL_SHADER,
  FLUID_DISPLAY_SHADER,
  FLUID_DIVERGENCE_SHADER,
  FLUID_GRADIENT_SUBTRACT_SHADER,
  FLUID_INIT_DYE_SHADER,
  FLUID_PRESSURE_SHADER,
  FLUID_REFERENCE_DISPLAY_SHADER,
  FLUID_SPLAT_SHADER,
  FLUID_SUNRAYS_MASK_SHADER,
  FLUID_SUNRAYS_SHADER,
  FLUID_VORTICITY_SHADER,
} from './FluidTankReferenceShaders.js';
import {
  SOURCE_MAPPED_ADVECTION_SHADER,
  SOURCE_MAPPED_DIVERGENCE_SHADER,
  SOURCE_MAPPED_FORCE_SHADER,
  SOURCE_MAPPED_GRADIENT_SHADER,
  SOURCE_MAPPED_PRESSURE_SHADER,
} from './SourceMappedFluidShaders.js';

export interface FluidSplat2D {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly dye: readonly [number, number, number];
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
  readonly solverMode?: 'stable' | 'source-mapped';
  readonly cellSize?: number;
  readonly simulationScale?: number;
  readonly velocityDecay?: number;
  readonly forceRadius?: number;
  readonly forceTaper?: number;
  readonly forceStrength?: number;
}

export interface StableFluidSeedOptions {
  readonly palette?: readonly (readonly [number, number, number])[];
  readonly paletteStrength?: number;
  readonly cellSize?: number;
}

export interface StableFluidDisplayOptions {
  readonly palette: readonly (readonly [number, number, number])[];
  readonly background: readonly [number, number, number];
  readonly shadingStrength: number;
  readonly sunraysStrength: number;
  readonly exposure?: number;
  readonly paletteStrength?: number;
  readonly edgeDarkening?: number;
  readonly bloomStrength?: number;
  readonly bloomThreshold?: number;
  readonly visualPipeline?: 'standard' | 'reference';
  readonly initMode?: 'blank' | 'random' | 'voronoi' | 'cloud' | 'image';
  readonly timeSeconds?: number;
  readonly seed?: number;
}

export interface StableFluidField2DOptions {
  readonly width: number;
  readonly height: number;
  readonly simulationWidth?: number;
  readonly simulationHeight?: number;
  readonly simulationPrecision?: 'half-float' | 'float';
  readonly simulationFilter?: 'nearest' | 'linear';
}

interface SourceMappedFluidPasses {
  readonly advection: GpuFieldPass;
  readonly force: GpuFieldPass;
  readonly divergence: GpuFieldPass;
  readonly pressure: GpuFieldPass;
  readonly gradient: GpuFieldPass;
}

export class StableFluidField2D {
  readonly velocity: GpuFieldState;
  readonly dye: GpuFieldState;
  readonly pressure: GpuFieldState;
  readonly divergence: GpuFieldState;
  readonly curlTarget: GpuFieldState;
  private readonly displayTarget: GpuFieldState;
  private readonly bloomTarget: GpuFieldState;
  private readonly bloomPyramid: readonly GpuFieldState[];
  private readonly sunraysMaskTarget: GpuFieldState;
  private readonly sunraysTarget: GpuFieldState;
  private readonly initPass: GpuFieldPass;
  private readonly splatPass: GpuFieldPass;
  private readonly advectionPass: GpuFieldPass;
  private readonly boundaryPass: GpuFieldPass;
  private readonly divergencePass: GpuFieldPass;
  private readonly curlPass: GpuFieldPass;
  private readonly vorticityPass: GpuFieldPass;
  private readonly pressurePass: GpuFieldPass;
  private readonly gradientPass: GpuFieldPass;
  private readonly displayPass: GpuFieldPass;
  private readonly bloomPrefilterPass: GpuFieldPass;
  private readonly bloomBlurPass: GpuFieldPass;
  private readonly bloomFinalPass: GpuFieldPass;
  private readonly blurPass: GpuFieldPass;
  private readonly sunraysMaskPass: GpuFieldPass;
  private readonly sunraysPass: GpuFieldPass;
  private readonly compositePass: GpuFieldPass;
  private readonly referenceDisplayPass: GpuFieldPass;
  private sourcePasses: SourceMappedFluidPasses | undefined;
  private readonly sourceForceSegments = new Float32Array(8 * 4);
  private readonly sourceForceParams = new Float32Array(8 * 4);
  private disposed = false;

  constructor(private readonly gl: WebGL2RenderingContext, options: StableFluidField2DOptions) {
    const simulation = { width: options.simulationWidth ?? options.width, height: options.simulationHeight ?? options.height };
    const simulationPrecision = options.simulationPrecision ?? 'half-float';
    this.velocity = field(gl, simulation.width, simulation.height, options.simulationFilter ?? 'linear', simulationPrecision);
    this.dye = field(gl, options.width, options.height, 'linear');
    this.pressure = field(gl, simulation.width, simulation.height, 'nearest', simulationPrecision);
    this.divergence = field(gl, simulation.width, simulation.height, 'nearest', simulationPrecision);
    this.curlTarget = field(gl, simulation.width, simulation.height, 'nearest', simulationPrecision);
    this.displayTarget = field(gl, options.width, options.height, 'linear');
    const bloomSize = resolutionFor(256, options.width, options.height);
    this.bloomTarget = field(gl, bloomSize.width, bloomSize.height, 'linear');
    const pyramid: GpuFieldState[] = [];
    for (let i = 0; i < 8; i += 1) {
      const width = bloomSize.width >> (i + 1);
      const height = bloomSize.height >> (i + 1);
      if (width < 2 || height < 2) break;
      pyramid.push(field(gl, width, height, 'linear'));
    }
    this.bloomPyramid = Object.freeze(pyramid);
    const raysSize = resolutionFor(clamp(Math.round(options.height * 0.18), 96, 220), options.width, options.height);
    this.sunraysMaskTarget = field(gl, raysSize.width, raysSize.height, 'linear');
    this.sunraysTarget = field(gl, raysSize.width, raysSize.height, 'linear');
    this.initPass = new GpuFieldPass(gl, FLUID_INIT_DYE_SHADER, 'fluid initialization');
    this.splatPass = new GpuFieldPass(gl, FLUID_SPLAT_SHADER, 'fluid splat');
    this.advectionPass = new GpuFieldPass(gl, FLUID_ADVECTION_SHADER, 'fluid advection');
    this.boundaryPass = new GpuFieldPass(gl, FLUID_BOUNDARY_SHADER, 'fluid boundary');
    this.divergencePass = new GpuFieldPass(gl, FLUID_DIVERGENCE_SHADER, 'fluid divergence');
    this.curlPass = new GpuFieldPass(gl, FLUID_CURL_SHADER, 'fluid curl');
    this.vorticityPass = new GpuFieldPass(gl, FLUID_VORTICITY_SHADER, 'fluid vorticity');
    this.pressurePass = new GpuFieldPass(gl, FLUID_PRESSURE_SHADER, 'fluid pressure');
    this.gradientPass = new GpuFieldPass(gl, FLUID_GRADIENT_SUBTRACT_SHADER, 'fluid projection');
    this.displayPass = new GpuFieldPass(gl, FLUID_DISPLAY_SHADER, 'fluid display');
    this.bloomPrefilterPass = new GpuFieldPass(gl, FLUID_BLOOM_PREFILTER_SHADER, 'fluid bloom prefilter');
    this.bloomBlurPass = new GpuFieldPass(gl, FLUID_BLOOM_BLUR_SHADER, 'fluid bloom pyramid');
    this.bloomFinalPass = new GpuFieldPass(gl, FLUID_BLOOM_FINAL_SHADER, 'fluid bloom final');
    this.blurPass = new GpuFieldPass(gl, FLUID_BLUR_SHADER, 'fluid blur');
    this.sunraysMaskPass = new GpuFieldPass(gl, FLUID_SUNRAYS_MASK_SHADER, 'fluid sunrays mask');
    this.sunraysPass = new GpuFieldPass(gl, FLUID_SUNRAYS_SHADER, 'fluid sunrays');
    this.compositePass = new GpuFieldPass(gl, FLUID_COMPOSITE_SHADER, 'fluid composite');
    this.referenceDisplayPass = new GpuFieldPass(gl, FLUID_REFERENCE_DISPLAY_SHADER, 'fluid reference display');
  }

  get width(): number { return this.dye.width; }
  get height(): number { return this.dye.height; }

  clear(): void {
    this.assert();
    for (const state of this.states()) state.clear();
  }

  uploadDyeRgba(values: Float32Array): void {
    const length = this.width * this.height * 4;
    if (values.length !== length) throw new Error('Fluid dye upload length does not match field dimensions');
    for (const target of [this.dye.targets.read, this.dye.targets.write]) {
      this.gl.bindTexture(this.gl.TEXTURE_2D, target.texture);
      this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, this.gl.RGBA, this.gl.FLOAT, values);
    }
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
  }

  seed(kind: 'cloud' | 'voronoi' | 'random' | 'blank', seed: number, options: StableFluidSeedOptions = {}): void {
    this.assert();
    this.clear();
    if (kind === 'blank') return;
    this.initPass.step(this.dye, (gl, uniform) => {
      gl.uniform2f(uniform('resolution'), this.width, this.height);
      gl.uniform1f(uniform('seed'), seed);
      gl.uniform1f(uniform('cellSize'), options.cellSize ?? 1.2);
      gl.uniform1i(uniform('initMode'), kind === 'voronoi' ? 1 : kind === 'random' ? 2 : 0);
      gl.uniform1i(uniform('hasInitImage'), 0);
      bindPalette(gl, uniform, options.palette ?? [[0.4, 1, 0.95]], options.paletteStrength ?? 0.76);
    });
  }

  step(options: StableFluidStepOptions, splats: readonly FluidSplat2D[] = []): void {
    this.assert();
    if (options.solverMode === 'source-mapped') {
      this.stepSourceMapped(options, splats);
      return;
    }
    const dt = clamp(options.deltaSeconds, 0, 0.032);
    for (const splat of splats) {
      this.applySplat(this.velocity, splat, [splat.velocityX, splat.velocityY, 0]);
      if (splat.amount !== 0) this.applySplat(this.dye, splat, [splat.dye[0] * splat.amount, splat.dye[1] * splat.amount, splat.dye[2] * splat.amount]);
    }
    const texelX = 1 / this.velocity.width;
    const texelY = 1 / this.velocity.height;
    this.curlPass.render(this.velocity, destination(this.curlTarget), (gl, uniform) => {
      gl.uniform1i(uniform('uVelocity'), this.velocity.targets.read.attach(0));
      gl.uniform2f(uniform('texelSize'), texelX, texelY);
    });
    if (options.curl > 0) this.vorticityPass.step(this.velocity, (gl, uniform) => {
      gl.uniform1i(uniform('uVelocity'), this.velocity.targets.read.attach(0));
      gl.uniform1i(uniform('uCurl'), this.curlTarget.targets.read.attach(1));
      gl.uniform2f(uniform('texelSize'), texelX, texelY);
      gl.uniform1f(uniform('curlStrength'), options.curl);
      gl.uniform1f(uniform('dt'), dt);
    });
    this.divergencePass.render(this.velocity, destination(this.divergence), (gl, uniform) => {
      gl.uniform1i(uniform('uVelocity'), this.velocity.targets.read.attach(0));
      gl.uniform2f(uniform('texelSize'), texelX, texelY);
    });
    this.clearPressure();
    const iterations = clamp(Math.floor(options.pressureIterations), 1, 48);
    for (let i = 0; i < iterations; i += 1) this.pressurePass.step(this.pressure, (gl, uniform) => {
      gl.uniform1i(uniform('uPressure'), this.pressure.targets.read.attach(0));
      gl.uniform1i(uniform('uDivergence'), this.divergence.targets.read.attach(1));
      gl.uniform2f(uniform('texelSize'), 1 / this.pressure.width, 1 / this.pressure.height);
    });
    this.gradientPass.step(this.velocity, (gl, uniform) => {
      gl.uniform1i(uniform('uPressure'), this.pressure.targets.read.attach(0));
      gl.uniform1i(uniform('uVelocity'), this.velocity.targets.read.attach(1));
      gl.uniform2f(uniform('texelSize'), texelX, texelY);
    });
    this.advectionPass.step(this.velocity, (gl, uniform) => {
      gl.uniform1i(uniform('uVelocity'), this.velocity.targets.read.attach(0));
      gl.uniform1i(uniform('uSource'), this.velocity.targets.read.attach(1));
      gl.uniform2f(uniform('texelSize'), texelX, texelY);
      gl.uniform1f(uniform('dt'), dt);
      gl.uniform1f(uniform('dissipation'), clamp(options.velocityDissipation, 0, 4));
    });
    this.boundaryPass.step(this.velocity, (gl, uniform) => {
      gl.uniform1i(uniform('uVelocity'), this.velocity.targets.read.attach(0));
      gl.uniform2f(uniform('texelSize'), texelX, texelY);
      gl.uniform1f(uniform('wallDamping'), 0);
    });
    this.advectionPass.step(this.dye, (gl, uniform) => {
      gl.uniform1i(uniform('uVelocity'), this.velocity.targets.read.attach(0));
      gl.uniform1i(uniform('uSource'), this.dye.targets.read.attach(1));
      gl.uniform2f(uniform('texelSize'), texelX, texelY);
      gl.uniform1f(uniform('dt'), dt);
      gl.uniform1f(uniform('dissipation'), clamp(options.dyeDissipation, 0, 4));
    });
  }

  render(destinationTarget: GpuParticleRenderDestination, options: StableFluidDisplayOptions): void {
    this.assert();
    if (options.palette.length < 1 || options.palette.length > 6) throw new Error('Fluid palette must contain between one and six colors');
    if (options.visualPipeline === 'reference') {
      this.applyBloom(this.dye, options);
      this.applySunrays(this.dye, options);
      this.referenceDisplayPass.render(this.dye, destinationTarget, (gl, uniform) => {
        gl.uniform1i(uniform('uTexture'), this.dye.targets.read.attach(0));
        gl.uniform1i(uniform('uBloom'), this.bloomTarget.targets.read.attach(1));
        gl.uniform1i(uniform('uSunrays'), this.sunraysTarget.targets.read.attach(2));
        bindDisplay(gl, uniform, this.dye, destinationTarget, options);
        gl.uniform1f(uniform('sunraysStrength'), options.sunraysStrength);
      });
      return;
    }
    this.displayPass.render(this.dye, destinationTarget, (gl, uniform) => {
      gl.uniform1i(uniform('uTexture'), this.dye.targets.read.attach(0));
      bindDisplay(gl, uniform, this.dye, destinationTarget, options);
      gl.uniform1i(uniform('visualPipeline'), 0);
      gl.uniform1f(uniform('seed'), options.seed ?? 0);
      bindPalette(gl, uniform, options.palette, options.paletteStrength ?? 0.76);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const state of this.states()) state.dispose();
    for (const pass of this.passes()) pass.dispose();
  }

  private applySplat(state: GpuFieldState, splat: FluidSplat2D, color: readonly [number, number, number]): void {
    this.splatPass.step(state, (gl, uniform) => {
      gl.uniform1i(uniform('uTarget'), state.targets.read.attach(0));
      gl.uniform1f(uniform('aspectRatio'), state.width / state.height);
      gl.uniform3f(uniform('color'), color[0], color[1], color[2]);
      gl.uniform2f(uniform('point'), clamp(splat.x, 0.001, 0.999), clamp(splat.y, 0.001, 0.999));
      gl.uniform1f(uniform('radius'), splat.radius * splat.radius);
    });
  }

  private clearPressure(): void {
    clearFluidPressureField(this.pressure);
  }

  private stepSourceMapped(options: StableFluidStepOptions, splats: readonly FluidSplat2D[]): void {
    const passes = this.getSourcePasses();
    const dt = clamp(options.deltaSeconds, 0, 1 / 30);
    if (dt <= 0) return;
    const safeDt = Math.max(0.0001, dt);
    const cellSize = Math.max(1, options.cellSize ?? 32);
    const simulationScale = Math.max(0.25, options.simulationScale ?? 1);
    const aspect = this.velocity.width / Math.max(1, this.velocity.height);
    const invX = 1 / this.velocity.width;
    const invY = 1 / this.velocity.height;
    const bindCommon = (gl: WebGL2RenderingContext, uniform: (name: string) => WebGLUniformLocation | null): void => {
      gl.uniform2f(uniform('uInvResolution'), invX, invY);
      gl.uniform1f(uniform('uAspectRatio'), aspect);
      gl.uniform1f(uniform('uSimulationScale'), simulationScale);
    };

    passes.advection.step(this.velocity, (gl, uniform) => {
      bindCommon(gl, uniform);
      gl.uniform1i(uniform('uVelocity'), this.velocity.targets.read.attach(0));
      gl.uniform1i(uniform('uTarget'), this.velocity.targets.read.attach(1));
      gl.uniform1f(uniform('uDt'), dt);
      gl.uniform1f(uniform('uRdx'), 1 / cellSize);
    });

    this.sourceForceSegments.fill(0);
    this.sourceForceParams.fill(0);
    const forceCount = Math.min(8, splats.length);
    for (let index = 0; index < forceCount; index += 1) {
      const splat = splats[index];
      if (!splat) continue;
      const offset = index * 4;
      this.sourceForceSegments[offset] = (splat.x * 2 - 1) * aspect * simulationScale;
      this.sourceForceSegments[offset + 1] = (splat.y * 2 - 1) * simulationScale;
      this.sourceForceSegments[offset + 2] = ((splat.previousX ?? splat.x) * 2 - 1) * aspect * simulationScale;
      this.sourceForceSegments[offset + 3] = ((splat.previousY ?? splat.y) * 2 - 1) * simulationScale;
      this.sourceForceParams[offset] = splat.strength ?? 1;
    }
    passes.force.step(this.velocity, (gl, uniform) => {
      bindCommon(gl, uniform);
      gl.uniform1i(uniform('uVelocity'), this.velocity.targets.read.attach(0));
      gl.uniform4fv(uniform('uForceSegments[0]'), this.sourceForceSegments);
      gl.uniform4fv(uniform('uForceParams[0]'), this.sourceForceParams);
      gl.uniform1i(uniform('uForceCount'), forceCount);
      gl.uniform1f(uniform('uDt'), safeDt);
      gl.uniform1f(uniform('uCellSize'), cellSize);
      gl.uniform1f(uniform('uVelocityDecay'), clamp(options.velocityDecay ?? 0.999, 0, 1));
      gl.uniform1f(uniform('uForceRadius'), Math.max(0.0001, options.forceRadius ?? 0.015) * simulationScale);
      gl.uniform1f(uniform('uForceTaper'), clamp(options.forceTaper ?? 0.6, 0, 1));
      gl.uniform1f(uniform('uForceStrength'), options.forceStrength ?? 1);
      gl.uniform1f(uniform('uForceVelocityScale'), 1 / simulationScale);
    });

    passes.divergence.render(this.velocity, destination(this.divergence), (gl, uniform) => {
      bindCommon(gl, uniform);
      gl.uniform1i(uniform('uVelocity'), this.velocity.targets.read.attach(0));
      gl.uniform1f(uniform('uHalfRdx'), 0.5 / cellSize);
    });
    const iterations = clamp(Math.floor(options.pressureIterations), 1, 48);
    for (let index = 0; index < iterations; index += 1) passes.pressure.step(this.pressure, (gl, uniform) => {
      bindCommon(gl, uniform);
      gl.uniform1i(uniform('uPressure'), this.pressure.targets.read.attach(0));
      gl.uniform1i(uniform('uDivergence'), this.divergence.targets.read.attach(1));
      gl.uniform1f(uniform('uAlpha'), -cellSize * cellSize);
    });
    passes.gradient.step(this.velocity, (gl, uniform) => {
      bindCommon(gl, uniform);
      gl.uniform1i(uniform('uPressure'), this.pressure.targets.read.attach(0));
      gl.uniform1i(uniform('uVelocity'), this.velocity.targets.read.attach(1));
      gl.uniform1f(uniform('uHalfRdx'), 0.5 / cellSize);
    });
  }

  private getSourcePasses(): SourceMappedFluidPasses {
    if (this.sourcePasses) return this.sourcePasses;
    this.sourcePasses = {
      advection: new GpuFieldPass(this.gl, SOURCE_MAPPED_ADVECTION_SHADER, 'source-mapped fluid advection'),
      force: new GpuFieldPass(this.gl, SOURCE_MAPPED_FORCE_SHADER, 'source-mapped fluid forces'),
      divergence: new GpuFieldPass(this.gl, SOURCE_MAPPED_DIVERGENCE_SHADER, 'source-mapped fluid divergence'),
      pressure: new GpuFieldPass(this.gl, SOURCE_MAPPED_PRESSURE_SHADER, 'source-mapped fluid pressure'),
      gradient: new GpuFieldPass(this.gl, SOURCE_MAPPED_GRADIENT_SHADER, 'source-mapped fluid projection'),
    };
    return this.sourcePasses;
  }

  private applyBloom(source: GpuFieldState, options: StableFluidDisplayOptions): void {
    const strength = Math.max(0, options.bloomStrength ?? 0);
    if (strength <= 0.0001) { this.bloomTarget.clear(); return; }
    const threshold = options.bloomThreshold ?? 0.6;
    const knee = threshold * 0.7 + 0.0001;
    this.bloomPrefilterPass.render(source, destination(this.bloomTarget), (gl, uniform) => {
      gl.uniform1i(uniform('uTexture'), source.targets.read.attach(0));
      gl.uniform3f(uniform('curve'), threshold - knee, knee * 2, 0.25 / knee);
      gl.uniform1f(uniform('threshold'), threshold);
    });
    let last = this.bloomTarget;
    for (const next of this.bloomPyramid) {
      this.bloomBlurPass.render(last, destination(next), (gl, uniform) => {
        gl.uniform1i(uniform('uTexture'), last.targets.read.attach(0));
        gl.uniform2f(uniform('texelSize'), 1 / last.width, 1 / last.height);
      });
      last = next;
    }
    for (let i = this.bloomPyramid.length - 2; i >= 0; i -= 1) {
      const next = this.bloomPyramid[i];
      if (!next) continue;
      this.bloomBlurPass.renderAdditive(last, destination(next), (gl, uniform) => {
        gl.uniform1i(uniform('uTexture'), last.targets.read.attach(0));
        gl.uniform2f(uniform('texelSize'), 1 / last.width, 1 / last.height);
      });
      last = next;
    }
    this.bloomFinalPass.render(last, destination(this.bloomTarget), (gl, uniform) => {
      gl.uniform1i(uniform('uTexture'), last.targets.read.attach(0));
      gl.uniform2f(uniform('texelSize'), 1 / last.width, 1 / last.height);
      gl.uniform1f(uniform('intensity'), strength);
    });
  }

  private applySunrays(source: GpuFieldState, options: StableFluidDisplayOptions): void {
    if (options.sunraysStrength <= 0.0001) { this.sunraysTarget.clear(); return; }
    this.sunraysMaskPass.render(source, {
      framebuffer: this.dye.targets.write.framebuffer,
      width: this.dye.width,
      height: this.dye.height,
    }, (gl, uniform) => gl.uniform1i(uniform('uTexture'), source.targets.read.attach(0)));
    this.sunraysPass.render(this.dye, destination(this.sunraysTarget), (gl, uniform) => {
      gl.uniform1i(uniform('uTexture'), this.dye.targets.write.attach(0));
      gl.uniform1f(uniform('weight'), Math.max(0, options.sunraysStrength));
    });
    this.blurPass.render(this.sunraysTarget, destination(this.sunraysMaskTarget), (gl, uniform) => {
      gl.uniform1i(uniform('uTexture'), this.sunraysTarget.targets.read.attach(0));
      gl.uniform2f(uniform('texelSize'), 1 / this.sunraysTarget.width, 1 / this.sunraysTarget.height);
      gl.uniform2f(uniform('direction'), 1, 0);
    });
    this.blurPass.render(this.sunraysMaskTarget, destination(this.sunraysTarget), (gl, uniform) => {
      gl.uniform1i(uniform('uTexture'), this.sunraysMaskTarget.targets.read.attach(0));
      gl.uniform2f(uniform('texelSize'), 1 / this.sunraysMaskTarget.width, 1 / this.sunraysMaskTarget.height);
      gl.uniform2f(uniform('direction'), 0, 1);
    });
  }

  private states(): readonly GpuFieldState[] {
    return [this.velocity, this.dye, this.pressure, this.divergence, this.curlTarget, this.displayTarget, this.bloomTarget, ...this.bloomPyramid, this.sunraysMaskTarget, this.sunraysTarget];
  }

  private passes(): readonly GpuFieldPass[] {
    const source = this.sourcePasses ? Object.values(this.sourcePasses) : [];
    return [this.initPass, this.splatPass, this.advectionPass, this.boundaryPass, this.divergencePass, this.curlPass, this.vorticityPass, this.pressurePass, this.gradientPass, this.displayPass, this.bloomPrefilterPass, this.bloomBlurPass, this.bloomFinalPass, this.blurPass, this.sunraysMaskPass, this.sunraysPass, this.compositePass, this.referenceDisplayPass, ...source];
  }

  private assert(): void { if (this.disposed) throw new Error('Stable fluid field has been disposed'); }
}

export function clearFluidPressureField(field: Pick<GpuFieldState, 'clear'>): void {
  field.clear();
}

function field(gl: WebGL2RenderingContext, width: number, height: number, filter: 'nearest' | 'linear', precision: 'half-float' | 'float' = 'half-float'): GpuFieldState {
  return new GpuFieldState(gl, { width, height, precision, filter });
}

function destination(state: GpuFieldState): GpuParticleRenderDestination {
  return { framebuffer: state.targets.read.framebuffer, width: state.width, height: state.height };
}

function resolutionFor(base: number, width: number, height: number): { width: number; height: number } {
  const aspect = width / Math.max(1, height);
  return aspect >= 1 ? { width: Math.round(base * aspect), height: base } : { width: base, height: Math.round(base / aspect) };
}

function bindPalette(
  gl: WebGL2RenderingContext,
  uniform: (name: string) => WebGLUniformLocation | null,
  palette: readonly (readonly [number, number, number])[],
  strength: number,
): void {
  const data = new Float32Array(18);
  const count = clamp(palette.length, 1, 6);
  for (let i = 0; i < 6; i += 1) data.set(palette[Math.min(i, count - 1)] ?? [0.4, 1, 0.95], i * 3);
  gl.uniform3fv(uniform('palette[0]'), data);
  gl.uniform1i(uniform('paletteCount'), count);
  gl.uniform1f(uniform('paletteStrength'), clamp(strength, 0, 1));
}

function bindDisplay(
  gl: WebGL2RenderingContext,
  uniform: (name: string) => WebGLUniformLocation | null,
  source: GpuFieldState,
  destinationTarget: GpuParticleRenderDestination,
  options: StableFluidDisplayOptions,
): void {
  gl.uniform2f(uniform('texelSize'), 1 / source.width, 1 / source.height);
  gl.uniform2f(uniform('resolution'), destinationTarget.width, destinationTarget.height);
  gl.uniform1f(uniform('exposure'), options.exposure ?? 1);
  gl.uniform1f(uniform('time'), options.timeSeconds ?? 0);
  gl.uniform1f(uniform('edgeDarkening'), options.edgeDarkening ?? 0.18);
  gl.uniform1f(uniform('shadingStrength'), options.shadingStrength);
  gl.uniform1i(uniform('initMode'), initModeIndex(options.initMode));
}

function initModeIndex(mode: StableFluidDisplayOptions['initMode']): number {
  if (mode === 'voronoi') return 1;
  if (mode === 'random') return 2;
  if (mode === 'image') return 3;
  if (mode === 'blank') return 4;
  return 0;
}

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
