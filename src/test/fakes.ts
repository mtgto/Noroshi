import type { FileSystem, FileStat } from "../fileSystem";
import type { CommandRunner } from "../commandRunner";
import type { Clock } from "../clock";

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

/** Stands in for ExecCommandRunner: records commands instead of spawning a shell. */
export class FakeCommandRunner implements CommandRunner {
  calls: string[] = [];
  async run(commandLine: string): Promise<void> {
    this.calls.push(commandLine);
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
