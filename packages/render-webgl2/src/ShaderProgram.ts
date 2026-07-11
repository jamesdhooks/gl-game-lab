export interface ShaderVariableReflection {
  readonly name: string;
  readonly type: number;
  readonly size: number;
  readonly location: number | WebGLUniformLocation | null;
}

export interface ShaderProgramReflection {
  readonly label: string;
  readonly uniforms: readonly ShaderVariableReflection[];
  readonly attributes: readonly ShaderVariableReflection[];
}

export interface ShaderProgramSources {
  readonly label: string;
  readonly vertexSource: string;
  readonly fragmentSource: string;
}

const reflections = new WeakMap<WebGLProgram, ShaderProgramReflection>();

/** Compiles, links, labels, and reflects a WebGL2 shader program. */
export function createShaderProgram(gl: WebGL2RenderingContext, sources: ShaderProgramSources): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, 'vertex', sources.label, sources.vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, 'fragment', sources.label, sources.fragmentSource);
  const program = requireValue(gl.createProgram(), `${sources.label}: unable to create shader program`);
  try {
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`${sources.label}: shader link failed\n${gl.getProgramInfoLog(program) ?? 'No driver log was provided.'}`);
    }
    reflections.set(program, reflectProgram(gl, program, sources.label));
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  }
}

export function shaderProgramReflection(program: WebGLProgram): ShaderProgramReflection | undefined {
  return reflections.get(program);
}

export function requireShaderUniform(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
  label = 'Shader',
): WebGLUniformLocation {
  return requireValue(gl.getUniformLocation(program, name), `${label}: required uniform ${name} is inactive or missing`);
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  stage: 'vertex' | 'fragment',
  label: string,
  source: string,
): WebGLShader {
  const shader = requireValue(gl.createShader(type), `${label}: unable to create ${stage} shader`);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const driverLog = gl.getShaderInfoLog(shader) ?? 'No driver log was provided.';
    gl.deleteShader(shader);
    throw new Error(`${label}: ${stage} shader compilation failed\n${driverLog}\n${numberedSource(source)}`);
  }
  return shader;
}

function reflectProgram(gl: WebGL2RenderingContext, program: WebGLProgram, label: string): ShaderProgramReflection {
  const uniforms: ShaderVariableReflection[] = [];
  const attributes: ShaderVariableReflection[] = [];
  const uniformCount = Number(gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS));
  const attributeCount = Number(gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES));
  for (let index = 0; index < uniformCount; index += 1) {
    const info = gl.getActiveUniform(program, index);
    if (!info) continue;
    uniforms.push(Object.freeze({ name: info.name, type: info.type, size: info.size, location: gl.getUniformLocation(program, info.name) }));
  }
  for (let index = 0; index < attributeCount; index += 1) {
    const info = gl.getActiveAttrib(program, index);
    if (!info) continue;
    attributes.push(Object.freeze({ name: info.name, type: info.type, size: info.size, location: gl.getAttribLocation(program, info.name) }));
  }
  return Object.freeze({ label, uniforms: Object.freeze(uniforms), attributes: Object.freeze(attributes) });
}

function numberedSource(source: string): string {
  return source.split('\n').map((line, index) => `${String(index + 1).padStart(4, ' ')} | ${line}`).join('\n');
}

function requireValue<T>(value: T | null, message: string): T {
  if (value === null) throw new Error(message);
  return value;
}
