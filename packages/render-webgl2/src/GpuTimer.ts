interface DisjointTimerQueryExtension {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

/** Non-blocking WebGL GPU timer. Results are polled on later frames. */
export class GpuTimer {
  private extension: DisjointTimerQueryExtension | undefined;
  private active: WebGLQuery | undefined;
  private readonly pending: WebGLQuery[] = [];
  private latestMilliseconds: number | undefined;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.restore();
  }

  get supported(): boolean { return this.extension !== undefined; }
  get latestMs(): number | undefined { return this.latestMilliseconds; }

  begin(): void {
    this.poll();
    const extension = this.extension;
    if (!extension || this.active) return;
    const query = this.gl.createQuery();
    if (!query) return;
    this.gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
    this.active = query;
  }

  end(): void {
    const extension = this.extension;
    const query = this.active;
    if (!extension || !query) return;
    this.gl.endQuery(extension.TIME_ELAPSED_EXT);
    this.pending.push(query);
    this.active = undefined;
  }

  invalidate(): void {
    this.active = undefined;
    this.pending.length = 0;
    this.latestMilliseconds = undefined;
  }

  restore(): void {
    this.extension = this.gl.getExtension('EXT_disjoint_timer_query_webgl2') as DisjointTimerQueryExtension | null ?? undefined;
    this.active = undefined;
    this.pending.length = 0;
    this.latestMilliseconds = undefined;
  }

  destroy(): void {
    if (this.active) this.gl.deleteQuery(this.active);
    for (const query of this.pending) this.gl.deleteQuery(query);
    this.active = undefined;
    this.pending.length = 0;
    this.extension = undefined;
  }

  private poll(): void {
    const extension = this.extension;
    if (!extension || this.pending.length === 0) return;
    if (this.gl.getParameter(extension.GPU_DISJOINT_EXT) === true) {
      for (const query of this.pending) this.gl.deleteQuery(query);
      this.pending.length = 0;
      this.latestMilliseconds = undefined;
      return;
    }
    while (this.pending.length > 0) {
      const query = this.pending[0];
      if (!query || this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE) !== true) break;
      const elapsedNanoseconds = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT) as unknown;
      this.gl.deleteQuery(query);
      this.pending.shift();
      if (typeof elapsedNanoseconds === 'number' && Number.isFinite(elapsedNanoseconds) && elapsedNanoseconds >= 0) {
        this.latestMilliseconds = elapsedNanoseconds / 1_000_000;
      }
    }
  }
}
