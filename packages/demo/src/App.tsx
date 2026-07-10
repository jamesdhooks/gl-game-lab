import { GameCanvas } from '@hooksjam/gl-game-lab-react';
import { createPlaygroundPlugin } from './PlaygroundPlugin.js';
import './index.css';

const plugins = [createPlaygroundPlugin()];

export function App(): JSX.Element {
  return (
    <main className="shell">
      <section className="intro">
        <p className="eyebrow">GPU-first game engine</p>
        <h1>GLGameLab</h1>
        <p>Native WebGL2 sprites are rendered through the same frame lifecycle that will host simulations, physics, and games.</p>
      </section>
      <section className="surface" aria-label="Engine render preview">
        <GameCanvas plugins={plugins} className="game-canvas" />
        <div className="caption">Instanced sprites · additive batches · browser input ready</div>
      </section>
    </main>
  );
}
