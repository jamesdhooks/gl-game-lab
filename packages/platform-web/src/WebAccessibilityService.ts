import type { AccessibilityPoliteness, AccessibilityService } from '@hooksjam/gl-game-lab-engine';

export class WebAccessibilityService implements AccessibilityService {
  private readonly polite: HTMLDivElement;
  private readonly assertive: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private destroyed = false;

  constructor(private readonly host: HTMLElement) {
    const document = host.ownerDocument;
    this.polite = createRegion(document, 'status', 'polite');
    this.assertive = createRegion(document, 'alert', 'assertive');
    this.status = createRegion(document, 'status', 'off');
    host.insertAdjacentElement('afterend', this.polite);
    this.polite.insertAdjacentElement('afterend', this.assertive);
    this.assertive.insertAdjacentElement('afterend', this.status);
  }

  get enabled(): boolean {
    return !this.destroyed;
  }

  announce(message: string, politeness: AccessibilityPoliteness = 'polite'): void {
    this.assertUsable();
    const region = politeness === 'assertive' ? this.assertive : this.polite;
    region.textContent = '';
    queueMicrotask(() => { if (!this.destroyed) region.textContent = message; });
  }

  setStatus(message: string): void {
    this.assertUsable();
    this.status.textContent = message;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.polite.remove();
    this.assertive.remove();
    this.status.remove();
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('Web accessibility service has been destroyed');
  }
}

function createRegion(document: Document, role: string, live: 'off' | AccessibilityPoliteness): HTMLDivElement {
  const region = document.createElement('div');
  region.setAttribute('role', role);
  region.setAttribute('aria-live', live);
  region.setAttribute('aria-atomic', 'true');
  Object.assign(region.style, {
    position: 'absolute', width: '1px', height: '1px', padding: '0', margin: '-1px',
    overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: '0',
  });
  return region;
}
