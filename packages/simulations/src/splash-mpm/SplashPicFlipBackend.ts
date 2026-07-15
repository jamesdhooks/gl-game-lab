import type { Gpu2DCapabilities } from '@hooksjam/gl-game-lab-engine';

export type SplashPicFlipBackendKind = 'cpu' | 'gpu';
export type SplashPicFlipBackendRequest = 'auto' | 'cpu' | 'gpu';

export interface SplashPicFlipBackendDecision {
  readonly backend: SplashPicFlipBackendKind;
  readonly gpuEligible: boolean;
  readonly gpuImplemented: boolean;
  readonly reasons: readonly string[];
}

export interface SplashPicFlipBackendOptions {
  readonly request?: SplashPicFlipBackendRequest;
  readonly gpuImplemented?: boolean;
  readonly parityValidated?: boolean;
}

export function resolveSplashPicFlipBackend(
  capabilities: Gpu2DCapabilities | undefined,
  options: SplashPicFlipBackendOptions = {},
): SplashPicFlipBackendDecision {
  const request = options.request ?? 'auto';
  const particleGrid = capabilities?.particleGrid;
  const reasons: string[] = [];

  if (request === 'cpu') {
    return Object.freeze({
      backend: 'cpu',
      gpuEligible: particleGrid?.supported ?? false,
      gpuImplemented: options.gpuImplemented === true,
      reasons: Object.freeze(['CPU backend requested']),
    });
  }

  if (!particleGrid?.floatRenderTargets) reasons.push('EXT_color_buffer_float is unavailable');
  if (!particleGrid?.floatBlend) reasons.push('EXT_float_blend is unavailable');
  if (!particleGrid?.multipleRenderTargets) reasons.push('multiple render targets are unavailable');
  if (!particleGrid?.vertexTextureFetch) reasons.push('vertex texture fetch is unavailable');

  const gpuEligible = reasons.length === 0;
  if (!gpuEligible) {
    return Object.freeze({
      backend: 'cpu',
      gpuEligible,
      gpuImplemented: options.gpuImplemented === true,
      reasons: Object.freeze(reasons),
    });
  }

  if (options.gpuImplemented !== true) reasons.push('GPU PIC/FLIP backend is not implemented');
  if (options.parityValidated !== true) reasons.push('GPU PIC/FLIP parity has not been validated');

  const backend = reasons.length === 0 ? 'gpu' : 'cpu';
  if (request === 'gpu' && backend === 'cpu') reasons.unshift('GPU backend requested but cannot be selected safely');

  return Object.freeze({
    backend,
    gpuEligible,
    gpuImplemented: options.gpuImplemented === true,
    reasons: Object.freeze(reasons),
  });
}
