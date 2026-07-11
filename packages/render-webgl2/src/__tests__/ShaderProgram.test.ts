import { describe, expect, it } from 'vitest';
import { createShaderProgram, shaderProgramReflection } from '../ShaderProgram.js';

describe('createShaderProgram', () => {
  it('reports the labeled stage, driver log, and numbered source on compilation failure', () => {
    const shader = {} as WebGLShader;
    const gl = {
      VERTEX_SHADER: 1,
      FRAGMENT_SHADER: 2,
      COMPILE_STATUS: 3,
      createShader: () => shader,
      shaderSource: () => undefined,
      compileShader: () => undefined,
      getShaderParameter: () => false,
      getShaderInfoLog: () => 'ERROR: 0:2: syntax error',
      deleteShader: () => undefined,
    } as unknown as WebGL2RenderingContext;

    expect(() => createShaderProgram(gl, {
      label: 'test.effect',
      vertexSource: 'first\nsecond',
      fragmentSource: 'fragment',
    })).toThrow(/test\.effect: vertex shader compilation failed[\s\S]*2 \| second/);
  });

  it('records active uniform and attribute reflection after linking', () => {
    const program = {} as WebGLProgram;
    const gl = {
      VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
      ACTIVE_UNIFORMS: 5, ACTIVE_ATTRIBUTES: 6,
      createShader: () => ({} as WebGLShader), shaderSource: () => undefined, compileShader: () => undefined,
      getShaderParameter: () => true, deleteShader: () => undefined,
      createProgram: () => program, attachShader: () => undefined, linkProgram: () => undefined,
      getProgramParameter: (_program: WebGLProgram, parameter: number) => parameter === 4 ? true : 1,
      getProgramInfoLog: () => '', deleteProgram: () => undefined,
      getActiveUniform: () => ({ name: 'uTime', size: 1, type: 7 }),
      getUniformLocation: () => ({} as WebGLUniformLocation),
      getActiveAttrib: () => ({ name: 'aPosition', size: 1, type: 8 }),
      getAttribLocation: () => 0,
    } as unknown as WebGL2RenderingContext;

    const linked = createShaderProgram(gl, { label: 'test.linked', vertexSource: 'v', fragmentSource: 'f' });
    expect(shaderProgramReflection(linked)).toMatchObject({
      label: 'test.linked',
      uniforms: [{ name: 'uTime', size: 1, type: 7 }],
      attributes: [{ name: 'aPosition', size: 1, type: 8, location: 0 }],
    });
  });
});
