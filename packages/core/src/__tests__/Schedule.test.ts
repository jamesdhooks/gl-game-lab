import { describe, expect, it } from 'vitest';
import {
  Clock,
  Schedule,
  ScheduleRunner,
  TransformComponent,
  World,
  WorldMutationError,
  createTransform2D,
} from '../index.js';

describe('Clock', () => {
  it('produces deterministic fixed steps and a variable snapshot', () => {
    const clock = new Clock({ fixedDeltaSeconds: 0.1 });

    const first = clock.advance(0.25);
    const second = clock.advance(0.05);

    expect(first.fixed.map((time) => time.elapsedSeconds)).toEqual([0.1, 0.2]);
    expect(first.variable.interpolationAlpha).toBeCloseTo(0.5);
    expect(second.fixed).toHaveLength(1);
    expect(second.fixed[0]?.fixedStep).toBe(3);
    expect(second.variable.elapsedSeconds).toBeCloseTo(0.3);
  });

  it('supports pause, scaling, manual stepping, and spiral protection', () => {
    const clock = new Clock({ fixedDeltaSeconds: 0.1, maximumFixedStepsPerFrame: 2 });
    clock.setPaused(true);
    clock.requestFixedSteps();
    expect(clock.advance(1).fixed).toHaveLength(1);

    clock.setPaused(false);
    clock.setTimeScale(2);
    const overloaded = clock.advance(0.25);
    expect(overloaded.fixed).toHaveLength(2);
    expect(overloaded.droppedFixedSeconds).toBeCloseTo(0.3);
  });
});

describe('Schedule', () => {
  it('orders systems deterministically and applies deferred commands after a stage', () => {
    const schedule = new Schedule();
    const world = new World();
    const order: string[] = [];
    schedule.addSystem({
      id: 'game.spawn',
      stage: 'update',
      before: ['game.observe'],
      run: ({ commands }) => {
        order.push('spawn');
        commands.insert(commands.spawn(), TransformComponent, createTransform2D(4, 5));
      },
    });
    schedule.addSystem({
      id: 'game.observe',
      stage: 'update',
      run: () => { order.push('observe'); },
    });

    const runner = new ScheduleRunner(schedule, world);
    runner.start();
    runner.runFrame(1 / 60);

    expect(order).toEqual(['spawn', 'observe']);
    expect([...world.query(TransformComponent)]).toHaveLength(1);
  });

  it('prevents direct structural changes during systems', () => {
    const schedule = new Schedule();
    const world = new World();
    schedule.addSystem({
      id: 'invalid.spawn',
      stage: 'update',
      run: ({ world: currentWorld }) => { currentWorld.spawn(); },
    });
    const runner = new ScheduleRunner(schedule, world);
    runner.start();

    expect(() => runner.runFrame(1 / 60)).toThrow(WorldMutationError);
  });

  it('detects missing ordering targets and cycles', () => {
    const missing = new Schedule();
    missing.addSystem({ id: 'one', stage: 'update', after: ['missing'], run: () => undefined });
    expect(() => missing.orderedSystems('update')).toThrow('unknown system');

    const cyclic = new Schedule();
    cyclic.addSystem({ id: 'one', stage: 'update', after: ['two'], run: () => undefined });
    cyclic.addSystem({ id: 'two', stage: 'update', after: ['one'], run: () => undefined });
    expect(() => cyclic.orderedSystems('update')).toThrow('cycle');
  });

  it('runs custom stages in their declared position', () => {
    const schedule = new Schedule().addStage('gameplay', { after: 'update' });
    const updateIndex = schedule.stageIds.indexOf('update');
    expect(schedule.stageIds[updateIndex + 1]).toBe('gameplay');
    const order: string[] = [];
    schedule.addSystem({ id: 'update', stage: 'update', run: () => { order.push('update'); } });
    schedule.addSystem({ id: 'gameplay', stage: 'gameplay', run: () => { order.push('gameplay'); } });
    const runner = new ScheduleRunner(schedule, new World());
    runner.start();
    runner.runFrame(0);
    expect(order).toEqual(['update', 'gameplay']);
  });

  it('records terminal failure states for startup, frame, and shutdown errors', () => {
    const startup = new Schedule();
    startup.addSystem({
      id: 'broken.startup', stage: 'startup', run: () => { throw new Error('startup failed'); },
    });
    const startupRunner = new ScheduleRunner(startup, new World());
    expect(() => startupRunner.start()).toThrow('startup failed');
    expect(startupRunner.state).toBe('failed');
    expect(() => startupRunner.start()).toThrow('cannot start from failed');
    startupRunner.stop();
    expect(startupRunner.state).toBe('stopped');

    const frame = new Schedule();
    frame.addSystem({
      id: 'broken.frame', stage: 'update', run: () => { throw new Error('frame failed'); },
    });
    const frameRunner = new ScheduleRunner(frame, new World());
    frameRunner.start();
    expect(() => frameRunner.runFrame(1 / 60)).toThrow('frame failed');
    expect(frameRunner.state).toBe('failed');
    frameRunner.stop();
    expect(frameRunner.state).toBe('stopped');

    const shutdown = new Schedule();
    shutdown.addSystem({
      id: 'broken.shutdown', stage: 'shutdown', run: () => { throw new Error('shutdown failed'); },
    });
    const shutdownRunner = new ScheduleRunner(shutdown, new World());
    shutdownRunner.start();
    expect(() => shutdownRunner.stop()).toThrow('shutdown failed');
    expect(shutdownRunner.state).toBe('failed');
  });
});
