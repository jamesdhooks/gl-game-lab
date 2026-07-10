import type { World } from '../ecs/World.js';
import type { Schedule } from './Schedule.js';
import { Clock, type ClockOptions } from './Time.js';

export class ScheduleRunner {
  readonly clock: Clock;
  private started = false;

  constructor(
    private readonly schedule: Schedule,
    private readonly world: World,
    clockOptions: ClockOptions = {},
  ) {
    this.clock = new Clock(clockOptions);
  }

  start(): void {
    if (this.started) throw new Error('Schedule runner has already started');
    this.started = true;
    this.runStagesOfKind('startup', this.clock.current());
  }

  runFrame(realDeltaSeconds: number): void {
    if (!this.started) throw new Error('Schedule runner must be started before frames run');
    const advance = this.clock.advance(realDeltaSeconds);
    for (const time of advance.fixed) {
      this.runStagesOfKind('fixed', time);
    }
    this.runStagesOfKind('frame', advance.variable);
  }

  stop(): void {
    if (!this.started) return;
    this.runStagesOfKind('shutdown', this.clock.current());
    this.started = false;
  }

  private runStagesOfKind(kind: ReturnType<Schedule['stageKind']>, time: ReturnType<Clock['current']>): void {
    for (const stage of this.schedule.stageIds) {
      if (this.schedule.stageKind(stage) === kind) this.schedule.runStage(stage, this.world, time);
    }
  }
}
