import {
  buildSpriteDrawPlan,
  createSpriteCamera2D,
  type SpriteCamera2D,
  type SpriteInstance,
} from './SpriteRenderer.js';

export class SpriteRenderQueue {
  private readonly sprites: SpriteInstance[] = [];
  private camera: SpriteCamera2D;

  constructor(viewportWidth: number, viewportHeight: number) {
    this.camera = createSpriteCamera2D(viewportWidth, viewportHeight);
  }

  submit(sprite: SpriteInstance): void { this.sprites.push(sprite); }
  submitAll(sprites: readonly SpriteInstance[]): void { this.sprites.push(...sprites); }
  setCamera(camera: SpriteCamera2D): void { this.camera = camera; }
  get activeCamera(): SpriteCamera2D { return this.camera; }
  buildPlan() { return buildSpriteDrawPlan(this.sprites, this.camera); }
  clear(): void { this.sprites.length = 0; }
  get count(): number { return this.sprites.length; }
}
