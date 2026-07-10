const eventIdentity = Symbol('GLGameLabEventToken');

export interface EventToken<T> {
  readonly id: string;
  readonly [eventIdentity]: T;
}

export type EventListener<T> = (event: T) => void;

interface EventChannel {
  readonly token: EventToken<unknown>;
  readonly listeners: Set<EventListener<unknown>>;
}

interface QueuedEvent {
  readonly token: EventToken<unknown>;
  readonly event: unknown;
}

export function createEventToken<T>(id: string): EventToken<T> {
  const normalized = id.trim();
  if (normalized.length === 0) throw new Error('Event token id cannot be empty');
  return Object.freeze({ id: normalized }) as EventToken<T>;
}

export class EventBus {
  private readonly tokens = new Map<string, EventToken<unknown>>();
  private readonly channels = new Map<string, EventChannel>();
  private queue: QueuedEvent[] = [];
  private flushing = false;

  on<T>(token: EventToken<T>, listener: EventListener<T>): () => void {
    const channel = this.channel(token);
    channel.listeners.add(listener as EventListener<unknown>);
    return () => {
      channel.listeners.delete(listener as EventListener<unknown>);
      if (channel.listeners.size === 0) this.channels.delete(token.id);
    };
  }

  once<T>(token: EventToken<T>, listener: EventListener<T>): () => void {
    let unsubscribe: (() => void) | undefined;
    unsubscribe = this.on(token, (event) => {
      unsubscribe?.();
      listener(event);
    });
    return unsubscribe;
  }

  emit<T>(token: EventToken<T>, event: T): void {
    const channel = this.existingChannel(token);
    if (!channel) return;
    for (const listener of [...channel.listeners]) listener(event);
  }

  enqueue<T>(token: EventToken<T>, event: T): void {
    this.assertToken(token);
    this.queue.push({ token: token as EventToken<unknown>, event });
  }

  flush(): number {
    if (this.flushing) throw new Error('Event queue cannot be flushed recursively');
    const pending = this.queue;
    this.queue = [];
    this.flushing = true;
    let index = 0;
    try {
      for (; index < pending.length; index += 1) {
        const queued = pending[index];
        if (queued) this.emit(queued.token, queued.event);
      }
    } catch (error) {
      this.queue = [...pending.slice(index + 1), ...this.queue];
      throw error;
    } finally {
      this.flushing = false;
    }
    return pending.length;
  }

  clear(token?: EventToken<unknown>): void {
    if (!token) {
      this.channels.clear();
      this.queue = [];
      return;
    }
    this.assertToken(token);
    this.channels.delete(token.id);
    this.queue = this.queue.filter((entry) => entry.token !== token);
  }

  listenerCount<T>(token: EventToken<T>): number {
    return this.existingChannel(token)?.listeners.size ?? 0;
  }

  get queuedCount(): number {
    return this.queue.length;
  }

  private channel<T>(token: EventToken<T>): EventChannel {
    this.assertToken(token);
    const existing = this.channels.get(token.id);
    if (existing) {
      if (existing.token !== token) throw eventTokenCollision(token.id);
      return existing;
    }
    const channel: EventChannel = {
      token: token as EventToken<unknown>,
      listeners: new Set(),
    };
    this.channels.set(token.id, channel);
    return channel;
  }

  private existingChannel<T>(token: EventToken<T>): EventChannel | undefined {
    this.assertToken(token);
    const existing = this.channels.get(token.id);
    if (existing && existing.token !== token) throw eventTokenCollision(token.id);
    return existing;
  }

  private assertToken<T>(token: EventToken<T>): void {
    const registered = this.tokens.get(token.id);
    if (registered && registered !== token) throw eventTokenCollision(token.id);
    if (!registered) this.tokens.set(token.id, token as EventToken<unknown>);
  }
}

function eventTokenCollision(id: string): Error {
  return new Error(`Event id is already registered by another token: ${id}`);
}
