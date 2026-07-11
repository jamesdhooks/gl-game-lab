import { describe, expect, it } from 'vitest';
import { GpuTimer } from '../GpuTimer.js';

describe('GpuTimer', () => {
  it('polls completed queries without synchronously waiting', () => {
    const query = {} as WebGLQuery;
    let available = false;
    const deleted: WebGLQuery[] = [];
    const gl = {
      QUERY_RESULT_AVAILABLE: 1,
      QUERY_RESULT: 2,
      getExtension: () => ({ TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 }),
      createQuery: () => query,
      beginQuery: () => undefined,
      endQuery: () => undefined,
      getParameter: () => false,
      getQueryParameter: (_query: WebGLQuery, parameter: number) => parameter === 1 ? available : 2_500_000,
      deleteQuery: (value: WebGLQuery) => { deleted.push(value); },
    } as unknown as WebGL2RenderingContext;
    const timer = new GpuTimer(gl);

    timer.begin();
    timer.end();
    timer.begin();
    expect(timer.latestMs).toBeUndefined();
    timer.end();
    available = true;
    timer.begin();
    expect(timer.latestMs).toBe(2.5);
    expect(deleted).toEqual([query, query]);
  });

  it('discards invalid results after a disjoint event or context loss', () => {
    const query = {} as WebGLQuery;
    let disjoint = true;
    const gl = {
      QUERY_RESULT_AVAILABLE: 1,
      QUERY_RESULT: 2,
      getExtension: () => ({ TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 }),
      createQuery: () => query,
      beginQuery: () => undefined,
      endQuery: () => undefined,
      getParameter: () => disjoint,
      getQueryParameter: () => true,
      deleteQuery: () => undefined,
    } as unknown as WebGL2RenderingContext;
    const timer = new GpuTimer(gl);
    timer.begin();
    timer.end();
    timer.begin();
    expect(timer.latestMs).toBeUndefined();
    disjoint = false;
    timer.invalidate();
    timer.restore();
    expect(timer.supported).toBe(true);
  });
});
