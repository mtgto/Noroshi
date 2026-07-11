import { buildPlayCommand } from "./config";
import type { CommandRunner } from "./commandRunner";
import type { Clock } from "./clock";
import type { RawEvent } from "./types";

export type SoundResolver = (eventKind: string) => string | null;

export interface PlayerOptions {
  runner: CommandRunner;
  clock: Clock;
  playerCommand: string;
  soundFor: SoundResolver;
  debounceMs: number;
  entrypointFilter: string[];
  log: (msg: string) => void;
}

const ERROR_LOG_INTERVAL_MS = 3 * 60 * 1000;

export class Player {
  private lastPlayed = new Map<string, number>();
  private lastErrorLog = 0;

  constructor(private readonly opts: PlayerOptions) {}

  handle(e: RawEvent): void {
    const { entrypointFilter, soundFor, clock, debounceMs, log } = this.opts;

    if (entrypointFilter.length > 0) {
      if (!e.entrypoint || !entrypointFilter.includes(e.entrypoint)) return;
    }

    const file = soundFor(e.event);
    if (!file) {
      log(`skip event without sound mapping: ${e.event}`);
      return;
    }

    const now = clock.now();
    const last = this.lastPlayed.get(e.event);
    if (last !== undefined && now - last < debounceMs) return;
    this.lastPlayed.set(e.event, now);

    const cmd = buildPlayCommand(this.opts.playerCommand, file);
    this.opts.runner.run(cmd).catch((err) => this.logError(err));
  }

  private logError(err: unknown): void {
    const now = this.opts.clock.now();
    if (now - this.lastErrorLog < ERROR_LOG_INTERVAL_MS) return;
    this.lastErrorLog = now;
    this.opts.log(`play command failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
