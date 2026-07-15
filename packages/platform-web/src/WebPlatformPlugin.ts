import type { EnginePlugin } from '@hooksjam/gl-game-lab-core';
import {
  EngineAccessibility,
  EngineAudio,
  EngineInput,
  EngineInputSources,
  EngineRenderer,
  EngineStorage,
  EngineWorkers,
  type AccessibilityService,
  type AudioService,
  type StorageService,
  type WorkerService,
} from '@hooksjam/gl-game-lab-engine';
import { WebAccessibilityService } from './WebAccessibilityService.js';
import { WebAudioService } from './WebAudioService.js';
import { WebInputAdapter } from './WebInputAdapter.js';
import { WebGamepadInputSource } from './WebGamepadInputSource.js';
import { WebStorageService } from './WebStorageService.js';
import { WebWorkerService } from './WebWorkerService.js';

export const WEB_PLATFORM_PLUGIN_ID = 'gl-game-lab.platform-web';

export interface WebPlatformPluginOptions {
  readonly storageNamespace?: string;
  readonly preventDefaultInput?: boolean;
  readonly inputEnabled?: boolean;
  readonly audio?: AudioService;
  readonly storage?: StorageService;
  readonly workers?: WorkerService;
  readonly accessibility?: AccessibilityService;
}

interface DestroyableAudioService extends AudioService { destroy?(): void | Promise<void> }
interface DestroyableWorkerService extends WorkerService { destroy?(): void }
interface DestroyableAccessibilityService extends AccessibilityService { destroy?(): void }

export function createWebPlatformPlugin(
  canvas: HTMLCanvasElement,
  options: WebPlatformPluginOptions = {},
): EnginePlugin {
  let input: WebInputAdapter | undefined;
  let audio: DestroyableAudioService | undefined;
  let storage: StorageService | undefined;
  let workers: DestroyableWorkerService | undefined;
  let accessibility: DestroyableAccessibilityService | undefined;
  let removeUnlockListeners = (): void => undefined;
  let removeGamepads = (): void => undefined;

  return {
    id: WEB_PLATFORM_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: (context) => {
      audio = options.audio ?? new WebAudioService();
      storage = options.storage ?? new WebStorageService(options.storageNamespace ?? 'gl-game-lab');
      workers = options.workers ?? new WebWorkerService();
      accessibility = options.accessibility ?? new WebAccessibilityService(canvas);
      context.provide(EngineAudio, audio);
      context.provide(EngineStorage, storage);
      context.provide(EngineWorkers, workers);
      context.provide(EngineAccessibility, accessibility);
      if (options.inputEnabled !== false) {
        input = new WebInputAdapter(canvas, {
          input: context.get(EngineInput),
          preventDefault: options.preventDefaultInput ?? true,
          getViewport: () => {
            const renderer = context.tryGet(EngineRenderer);
            if (renderer) return { width: renderer.viewport.width, height: renderer.viewport.height };
            const bounds = canvas.getBoundingClientRect();
            return { width: Math.max(1, bounds.width), height: Math.max(1, bounds.height) };
          },
        });
        if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
          removeGamepads = context.get(EngineInputSources).add(new WebGamepadInputSource(navigator));
        }
        const unlock = (): void => { void audio?.unlock().catch(() => undefined); };
        canvas.addEventListener('pointerdown', unlock, { once: true, capture: true });
        canvas.addEventListener('keydown', unlock, { once: true, capture: true });
        removeUnlockListeners = () => {
          canvas.removeEventListener('pointerdown', unlock, true);
          canvas.removeEventListener('keydown', unlock, true);
        };
      }
    },
    dispose: async () => {
      removeUnlockListeners();
      removeGamepads();
      input?.destroy();
      input = undefined;
      const failures: unknown[] = [];
      try { await audio?.destroy?.(); } catch (error) { failures.push(error); }
      try { workers?.destroy?.(); } catch (error) { failures.push(error); }
      try { accessibility?.destroy?.(); } catch (error) { failures.push(error); }
      audio = undefined; storage = undefined; workers = undefined; accessibility = undefined;
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) throw new AggregateError(failures, 'Web platform service disposal failed');
    },
  };
}
