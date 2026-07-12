import {
  type BitmapFont2DHandle,
  type Sprite2DDraw,
  type Text2DDraw,
  type Texture2DHandle,
} from '@hooksjam/gl-game-lab-engine';
import { type SpriteTexture } from './SpriteRenderer.js';
import { type SpriteRenderQueue } from './SpriteRenderQueue.js';
import { type WebGL2Device, type WebGLTextureResource } from './WebGL2Device.js';

interface ManagedTexture2D {
  readonly handle: Texture2DHandle;
  readonly resource: WebGLTextureResource;
  readonly spriteTexture: SpriteTexture;
}

interface ManagedBitmapFont2D {
  readonly handle: BitmapFont2DHandle;
  readonly texture: Texture2DHandle;
}

type TextureFactory = Pick<WebGL2Device, 'createTextureFromRgbaPixels'>;

/** Owns renderer-created 2D textures, bitmap fonts, and text-to-sprite expansion. */
export class ManagedRender2DResources {
  private readonly textures = new Map<string, ManagedTexture2D>();
  private readonly fonts = new Map<string, ManagedBitmapFont2D>();

  constructor(
    private readonly device: TextureFactory,
    private readonly sprites: SpriteRenderQueue,
    private readonly recordTextureUpload: (bytes: number) => void,
  ) {}

  createTexture(id: string, width: number, height: number, pixels: Uint8Array): Texture2DHandle {
    const normalizedId = id.trim();
    if (normalizedId.length === 0) throw new Error('2D texture id cannot be empty');
    if (this.textures.has(normalizedId)) throw new Error(`2D texture id is already registered: ${normalizedId}`);
    const resource = this.device.createTextureFromRgbaPixels(pixels, { width, height });
    this.recordTextureUpload(pixels.byteLength);
    const handle = Object.freeze({ id: normalizedId, width, height });
    const spriteTexture: SpriteTexture = {
      id: normalizedId,
      get texture() { return resource.texture; },
    };
    this.textures.set(normalizedId, { handle, resource, spriteTexture });
    return handle;
  }

  destroyTexture(texture: Texture2DHandle): void {
    const managed = this.textures.get(texture.id);
    if (!managed || managed.handle !== texture) return;
    managed.resource.dispose();
    this.textures.delete(texture.id);
  }

  hasTexture(id: string): boolean { return this.textures.has(id); }

  texture(id: string): Texture2DHandle {
    const texture = this.textures.get(id)?.handle;
    if (!texture) throw new Error(`2D texture is not registered: ${id}`);
    return texture;
  }

  nativeTexture(texture: Texture2DHandle): WebGLTexture {
    const managed = this.textures.get(texture.id);
    if (!managed || managed.handle !== texture) throw new Error(`2D texture handle is not owned by this renderer: ${texture.id}`);
    return managed.resource.texture;
  }

  createFont(
    id: string,
    characters: string,
    columns: number,
    glyphWidth: number,
    glyphHeight: number,
    pixels: Uint8Array,
  ): BitmapFont2DHandle {
    const normalizedId = id.trim();
    if (normalizedId.length === 0) throw new Error('Bitmap font id cannot be empty');
    if (this.fonts.has(normalizedId)) throw new Error(`Bitmap font id is already registered: ${normalizedId}`);
    if (new Set(characters).size !== characters.length || characters.length === 0) {
      throw new Error('Bitmap font characters must be unique and non-empty');
    }
    if (!Number.isSafeInteger(columns) || columns < 1 || !Number.isSafeInteger(glyphWidth) || glyphWidth < 1 || !Number.isSafeInteger(glyphHeight) || glyphHeight < 1) {
      throw new Error('Bitmap font grid dimensions must be positive integers');
    }
    const rows = Math.ceil(characters.length / columns);
    const texture = this.createTexture(`${normalizedId}.atlas`, columns * glyphWidth, rows * glyphHeight, pixels);
    const handle = Object.freeze({ id: normalizedId, characters, columns, glyphWidth, glyphHeight, lineHeight: glyphHeight });
    this.fonts.set(normalizedId, { handle, texture });
    return handle;
  }

  destroyFont(font: BitmapFont2DHandle): void {
    const managed = this.fonts.get(font.id);
    if (!managed || managed.handle !== font) return;
    this.destroyTexture(managed.texture);
    this.fonts.delete(font.id);
  }

  hasFont(id: string): boolean { return this.fonts.has(id); }

  font(id: string): BitmapFont2DHandle {
    const font = this.fonts.get(id)?.handle;
    if (!font) throw new Error(`Bitmap font is not registered: ${id}`);
    return font;
  }

  submit(sprite: Sprite2DDraw): void {
    const texture = this.textures.get(sprite.texture.id);
    if (!texture || texture.handle !== sprite.texture) {
      throw new Error(`2D texture handle is not owned by this renderer: ${sprite.texture.id}`);
    }
    this.sprites.submit({ ...sprite, texture: texture.spriteTexture });
  }

  submitText(draw: Text2DDraw): void {
    const managed = this.fonts.get(draw.font.id);
    if (!managed || managed.handle !== draw.font) {
      throw new Error(`Bitmap font handle is not owned by this renderer: ${draw.font.id}`);
    }
    const rows = Math.ceil(draw.font.characters.length / draw.font.columns);
    const scale = draw.size / draw.font.glyphHeight;
    const advance = draw.font.glyphWidth * scale;
    for (const [lineIndex, line] of draw.text.split('\n').entries()) {
      const offset = draw.align === 'center' ? -line.length * advance * 0.5 : draw.align === 'right' ? -line.length * advance : 0;
      for (const [glyphIndex, character] of [...line.toUpperCase()].entries()) {
        const characterIndex = draw.font.characters.indexOf(character);
        const fallbackIndex = draw.font.characters.indexOf('?');
        const index = Math.max(0, characterIndex >= 0 ? characterIndex : fallbackIndex);
        const column = index % draw.font.columns;
        const row = Math.floor(index / draw.font.columns);
        this.submit({
          texture: managed.texture,
          x: draw.x + offset + glyphIndex * advance,
          y: draw.y + lineIndex * draw.font.lineHeight * scale,
          width: advance,
          height: draw.font.glyphHeight * scale,
          anchorX: 0,
          anchorY: 0,
          ...(draw.color ? { tint: draw.color } : {}),
          uv: [column / draw.font.columns, row / rows, (column + 1) / draw.font.columns, (row + 1) / rows],
          ...(draw.zIndex === undefined ? {} : { zIndex: draw.zIndex }),
        });
      }
    }
  }

  destroy(): void {
    for (const font of [...this.fonts.values()]) this.destroyFont(font.handle);
    this.fonts.clear();
    for (const texture of this.textures.values()) texture.resource.dispose();
    this.textures.clear();
  }
}
