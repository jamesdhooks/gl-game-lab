export {
  WebInputAdapter,
  normalizePointerCoordinates,
  type ClientRectLike,
  type LogicalViewport,
  type WebInputAdapterOptions,
} from './WebInputAdapter.js';
export {
  BrowserFrameLoop,
  type AnimationFrameDriver,
} from './BrowserFrameLoop.js';
export {
  WebTextureAsset,
  createWebTextureLoader,
  type ImageTextureUploader,
  type WebTexture,
  type WebTextureDecoder,
  type WebTextureOptions,
} from './WebTextureAsset.js';
export { WebAudioService, type WebAudioServiceOptions } from './WebAudioService.js';
export { WebStorageService, type StorageArea } from './WebStorageService.js';
export { WebWorkerService, type WorkerFactory, type WorkerLike } from './WebWorkerService.js';
export { WebAccessibilityService } from './WebAccessibilityService.js';
export { WebGamepadInputSource, type GamepadProvider } from './WebGamepadInputSource.js';
export {
  WEB_PLATFORM_PLUGIN_ID,
  createWebPlatformPlugin,
  type WebPlatformPluginOptions,
} from './WebPlatformPlugin.js';
