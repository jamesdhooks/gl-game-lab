import { createAssetType, type AssetLoader } from '@hooksjam/gl-game-lab-core';
import {
  type SpriteTexture,
  type TextureFilter,
  type TextureFormat,
  type TextureWrap,
  type WebGLTextureResource,
} from '@hooksjam/gl-game-lab-render-webgl2';

export interface WebTextureOptions {
  readonly format?: TextureFormat;
  readonly filter?: TextureFilter;
  readonly wrap?: TextureWrap;
  readonly flipY?: boolean;
}

export interface WebTexture extends SpriteTexture {
  readonly width: number;
  readonly height: number;
  readonly resource: WebGLTextureResource;
}

export interface ImageTextureUploader {
  createTextureFromImage(source: TexImageSource, descriptor: {
    readonly width: number;
    readonly height: number;
    readonly format?: TextureFormat;
    readonly filter?: TextureFilter;
    readonly wrap?: TextureWrap;
    readonly flipY?: boolean;
    readonly releaseSource?: () => void;
  }): WebGLTextureResource;
}

export interface WebTextureDecoder {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  createImageBitmap(blob: Blob): Promise<ImageBitmap>;
}

export const WebTextureAsset = createAssetType<WebTexture, WebTextureOptions>('web.texture');

export function createWebTextureLoader(
  uploader: ImageTextureUploader,
  decoder: WebTextureDecoder = browserTextureDecoder(),
): AssetLoader<WebTexture, WebTextureOptions> {
  return {
    id: 'gl-game-lab.platform-web.texture-loader',
    type: WebTextureAsset,
    canLoad: (request) => request.source.length > 0,
    load: async (context, request) => {
      const response = await decoder.fetch(request.source, { signal: context.signal });
      if (!response.ok) throw new Error(`Texture request failed (${response.status}): ${request.source}`);
      const bitmap = await decoder.createImageBitmap(await response.blob());
      let sourceTransferred = false;
      try {
        const resource = uploader.createTextureFromImage(bitmap, {
          width: bitmap.width,
          height: bitmap.height,
          releaseSource: () => { bitmap.close(); },
          ...request.options,
        });
        sourceTransferred = true;
        return {
          id: request.id,
          get texture() { return resource.texture; },
          width: bitmap.width,
          height: bitmap.height,
          resource,
        };
      } finally {
        if (!sourceTransferred) bitmap.close();
      }
    },
    dispose: (texture) => { texture.resource.dispose(); },
  };
}

function browserTextureDecoder(): WebTextureDecoder {
  if (typeof fetch === 'undefined' || typeof createImageBitmap === 'undefined') {
    throw new Error('Web texture loading requires fetch and createImageBitmap');
  }
  return { fetch, createImageBitmap };
}
