import type { FileSystem, FileStat } from "../fileSystem";
import type { CommandRunner } from "../commandRunner";
import type { Clock } from "../clock";
import type { Timers } from "../timers";

// In-memory/no-op stand-ins for the DI seams (FileSystem, CommandRunner, Clock)
// so unit tests can drive DrainCore/Player/setupChecker without vscode or the OS.
// Each Fake* class substitutes for the production class named in its "implements".

/** Stands in for VSCodeFileSystem: an in-memory id -> content map instead of vscode.workspace.fs. */
export class FakeFileSystem implements FileSystem {
  private files = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initial)) this.files.set(k, v);
  }

  async stat(id: string): Promise<FileStat | null> {
    const v = this.files.get(id);
    return v === undefined ? null : { size: Buffer.byteLength(v, "utf8") };
  }
  async readFile(id: string): Promise<string> {
    const v = this.files.get(id);
    if (v === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    return v;
  }
  async rename(fromId: string, toId: string): Promise<void> {
    const v = this.files.get(fromId);
    if (v === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    this.files.delete(fromId);
    this.files.set(toId, v);
  }
  async delete(id: string): Promise<void> {
    this.files.delete(id);
  }

  // Test helper: simulate the hook appending a line.
  append(id: string, text: string): void {
    this.files.set(id, (this.files.get(id) ?? "") + text);
  }
  has(id: string): boolean {
    return this.files.has(id);
  }
}

/** Stands in for SpawnCommandRunner: records commands instead of spawning a process. */
export class FakeCommandRunner implements CommandRunner {
  calls: string[][] = [];
  async run(command: string, args: string[]): Promise<void> {
    this.calls.push([command, ...args]);
  }
}

/** Stands in for RealClock: a manually advanced clock instead of Date.now(). */
export class FakeClock implements Clock {
  constructor(private t = 0) {}
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

/** Stands in for RealTimers: timers fire on advance() instead of the event loop. */
export class FakeTimers implements Timers {
  private nextId = 1;
  private pending = new Map<number, { fn: () => void; due: number }>();
  private t = 0;

  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.pending.set(id, { fn, due: this.t + ms });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.pending.delete(handle as number);
  }

  /** Advance time and run every timer whose deadline has passed. */
  advance(ms: number): void {
    this.t += ms;
    const toDelete: number[] = [];
    const toCall: (() => void)[] = [];
    for (const [id, entry] of this.pending) {
      if (entry.due <= this.t) {
        toDelete.push(id);
        toCall.push(entry.fn);
      }
    }
    for (const id of toDelete) {
      this.pending.delete(id);
    }
    for (const fn of toCall) {
      fn();
    }
  }

  get pendingCount(): number {
    return this.pending.size;
  }
}
