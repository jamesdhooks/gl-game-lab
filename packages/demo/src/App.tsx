import { ExperienceRuntime } from '@hooksjam/gl-game-lab-react';
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
      <ExperienceRuntime
        definition={ballPitDefinition}
        className="surface"
        canvasClassName="game-canvas"
      />
    </main>
  );
}
