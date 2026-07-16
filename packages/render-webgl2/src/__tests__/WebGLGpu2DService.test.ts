import { describe, expect, it } from 'vitest';
import { detectGpu2DCapabilities } from '../WebGLGpu2DService.js';

describe('detectGpu2DCapabilities', () => {
  it('requires float render targets, float blending, MRT, and vertex texture fetch for particle-grid solvers', () => {
    const gl = mockGl({
      EXT_color_buffer_float: {},
      EXT_float_blend: {},
      maxDrawBuffers: 4,
      maxColorAttachments: 4,
      maxVertexTextureImageUnits: 8,
    });

    expect(detectGpu2DCapabilities(gl).particleGrid).toMatchObject({
      supported: true,
      floatRenderTargets: true,
      floatBlend: true,
      multipleRenderTargets: true,
      vertexTextureFetch: true,
    });
    expect(detectGpu2DCapabilities(gl).particleEffects).toEqual({
      metadataState: true,
      maxDrawBuffers: 4,
      maxColorAttachments: 4,
    });
  });

  it('does not advertise metadata state with only two draw buffers', () => {
    const gl = mockGl({
      EXT_color_buffer_float: {},
      EXT_float_blend: {},
      maxDrawBuffers: 2,
      maxColorAttachments: 2,
      maxVertexTextureImageUnits: 8,
    });
    expect(detectGpu2DCapabilities(gl).particleEffects?.metadataState).toBe(false);
  });

  it('does not claim particle-grid support when additive float blending is missing', () => {
    const gl = mockGl({
      EXT_color_buffer_float: {},
      maxDrawBuffers: 4,
      maxColorAttachments: 4,
      maxVertexTextureImageUnits: 8,
    });

    expect(detectGpu2DCapabilities(gl).particleGrid).toMatchObject({
      supported: false,
      floatRenderTargets: true,
      floatBlend: false,
    });
  });
});

function mockGl(options: {
  readonly EXT_color_buffer_float?: object;
  readonly EXT_float_blend?: object;
  readonly maxDrawBuffers: number;
  readonly maxColorAttachments: number;
  readonly maxVertexTextureImageUnits: number;
}): WebGL2RenderingContext {
  return {
    MAX_DRAW_BUFFERS: 0x8824,
    MAX_COLOR_ATTACHMENTS: 0x8cdf,
    MAX_VERTEX_TEXTURE_IMAGE_UNITS: 0x8b4c,
    getExtension: (name: string): object | null => {
      if (name === 'EXT_color_buffer_float') return options.EXT_color_buffer_float ?? null;
      if (name === 'EXT_float_blend') return options.EXT_float_blend ?? null;
      return null;
    },
    getParameter: (parameter: number): number => {
      if (parameter === 0x8824) return options.maxDrawBuffers;
      if (parameter === 0x8cdf) return options.maxColorAttachments;
      if (parameter === 0x8b4c) return options.maxVertexTextureImageUnits;
      return 0;
    },
  } as unknown as WebGL2RenderingContext;
}
