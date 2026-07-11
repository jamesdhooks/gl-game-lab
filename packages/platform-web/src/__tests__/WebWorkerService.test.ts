import { describe, expect, it } from 'vitest';
import { WebWorkerService, type WorkerLike } from '../index.js';

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: unknown;
  terminated = false;
  postMessage(message: unknown): void { this.posted = message; }
  terminate(): void { this.terminated = true; }
}

describe('WebWorkerService', () => {
  it('correlates a task response and terminates the worker', async () => {
    const worker = new FakeWorker();
    const service = new WebWorkerService(() => worker);
    const task = service.execute<{ value: number }, number>('worker.js', { value: 21 });
    expect(worker.posted).toEqual({ id: 1, input: { value: 21 } });
    worker.onmessage?.({ data: { id: 1, ok: true, value: 42 } } as MessageEvent<unknown>);

    await expect(task).resolves.toBe(42);
    expect(worker.terminated).toBe(true);
  });

  it('rejects and terminates active work on abort or service destruction', async () => {
    const abortedWorker = new FakeWorker();
    const controller = new AbortController();
    const service = new WebWorkerService(() => abortedWorker);
    const aborted = service.execute('worker.js', {}, { signal: controller.signal });
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    expect(abortedWorker.terminated).toBe(true);

    const destroyedWorker = new FakeWorker();
    const destroyedService = new WebWorkerService(() => destroyedWorker);
    const destroyed = destroyedService.execute('worker.js', {});
    destroyedService.destroy();
    await expect(destroyed).rejects.toThrow('destroyed');
    expect(destroyedWorker.terminated).toBe(true);
  });
});
