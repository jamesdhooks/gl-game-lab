import type { EnginePlugin } from '@hooksjam/gl-game-lab-core';
import { EngineSchedule } from '@hooksjam/gl-game-lab-engine';
import {
  WEBGL2_RENDERER_PLUGIN_ID,
  SpriteRenderQueueService,
  WebGL2RendererService,
  type SpriteTexture,
  type WebGLTextureResource,
} from '@hooksjam/gl-game-lab-render-webgl2';

export function createPlaygroundPlugin(): EnginePlugin {
  let textureResource: WebGLTextureResource | undefined;
  return {
    id: 'gl-game-lab.demo.playground',
    version: '1.0.0',
    dependencies: [{ id: WEBGL2_RENDERER_PLUGIN_ID }],
    install: (context) => {
      const renderer = context.get(WebGL2RendererService);
      const sprites = context.get(SpriteRenderQueueService);
      const resource = renderer.device.createTextureFromRgbaPixels(new Uint8Array([255, 255, 255, 255]), {
        width: 1,
        height: 1,
        filter: 'nearest',
      });
      textureResource = resource;
      const texture: SpriteTexture = { id: 'demo.white', texture: resource.texture };
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.demo.playground.sprites',
        stage: 'update',
        run: ({ time }) => {
          const camera = sprites.activeCamera;
          sprites.submit({
            texture,
            x: camera.centerX,
            y: camera.centerY,
            width: camera.viewportWidth / camera.zoom,
            height: camera.viewportHeight / camera.zoom,
            tint: [0.025, 0.04, 0.09, 1],
            blend: 'opaque',
            zIndex: -100,
          });
          for (let index = 0; index < 96; index += 1) {
            const seed = index * 31.7;
            const radius = 36 + (index % 12) * 23;
            const phase = time.elapsedSeconds * (0.25 + (index % 7) * 0.03) + seed;
            sprites.submit({
              texture,
              x: camera.centerX + Math.cos(phase) * radius,
              y: camera.centerY + Math.sin(phase * 1.21) * radius * 0.7,
              width: 3 + index % 5,
              height: 3 + index % 5,
              rotation: phase,
              tint: [
                0.2 + (index % 5) * 0.12,
                0.55 + (index % 3) * 0.14,
                1,
                0.35 + (index % 4) * 0.14,
              ],
              blend: 'additive',
              zIndex: index,
            });
          }
        },
      });
    },
    dispose: () => { textureResource?.dispose(); },
  };
}
