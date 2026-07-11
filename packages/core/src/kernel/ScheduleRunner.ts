import type { World } from '../ecs/World.js';
import type { Schedule } from './Schedule.js';
import { Clock, type ClockOptions } from './Time.js';

export type ScheduleRunnerState = 'created' | 'running' | 'stopped' | 'failed';

export class ScheduleRunner {
  readonly clock: Clock;
  private currentState: ScheduleRunnerState = 'created';

  constructor(
    private readonly schedule: Schedule,
    private readonly world: World,
    clockOptions: ClockOptions = {},
  ) {
    this.clock = new Clock(clockOptions);
  }

  get state(): ScheduleRunnerState {
    return this.currentState;
  }

  start(): void {
    if (this.currentState !== 'created' && this.currentState !== 'stopped') {
      throw new Error(`Schedule runner cannot start from ${this.currentState}`);
    }
    try {
      this.runStagesOfKind('startup', this.clock.current());
      this.currentState = 'running';
    } catch (error) {
      this.currentState = 'failed';
      throw error;
    }
  }

  runFrame(realDeltaSeconds: number): void {
    if (this.currentState !== 'running') throw new Error('Schedule runner must be running before frames run');
    try {
      const advance = this.clock.advance(realDeltaSeconds);
      for (const time of advance.fixed) {
        this.runStagesOfKind('fixed', time);
      }
      this.runStagesOfKind('frame', advance.variable);
    } catch (error) {
      this.currentState = 'failed';
      throw error;
    }
  }

  stop(): void {
    if (this.currentState === 'created' || this.currentState === 'stopped') return;
    try {
      this.runStagesOfKind('shutdown', this.clock.current());
      this.currentState = 'stopped';
    } catch (error) {
      this.currentState = 'failed';
      throw error;
    }
  }

  private runStagesOfKind(kind: ReturnType<Schedule['stageKind']>, time: ReturnType<Clock['current']>): void {
    for (const stage of this.schedule.stageIds) {
      if (this.schedule.stageKind(stage) === kind) this.schedule.runStage(stage, this.world, time);
    }
  }
}
