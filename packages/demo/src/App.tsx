import { GameCanvas } from '@hooksjam/gl-game-lab-react';
import { ballPitDefinition } from '@hooksjam/gl-game-lab-games';
import './index.css';

export function App(): JSX.Element {
  return (
    <main className="shell">
      <section className="intro">
        <p className="eyebrow">First migrated experience</p>
        <h1>{ballPitDefinition.name}</h1>
        <p>{ballPitDefinition.long}</p>
      </section>
      <section className="surface" aria-label="Engine render preview">
        <GameCanvas createPlugins={ballPitDefinition.createPlugins} className="game-canvas" />
        <div className="caption">Tap to add a ball · native engine physics and rendering</div>
      </section>
    </main>
  );
}
