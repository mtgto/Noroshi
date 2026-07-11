import type { FileSystem } from "./fileSystem";
import type { RawEvent } from "./types";

export const DRAINING_SUFFIX = ".draining";

export class DrainCore {
  private inFlight = false;
  private pending = false;
  private pendingEmit = false;
  private orphan = false; // a draining file whose read failed, awaiting retry
  private renameFailing = false; // suppresses duplicate rename-error logs

  constructor(
    private readonly fs: FileSystem,
    private readonly eventsId: string,
    private readonly onEvent: (e: RawEvent) => void,
    private readonly log: (msg: string) => void,
  ) {}

  /** rename -> read -> delete, then fire onEvent. Serialized, coalescing a pending re-run. */
  async drain(): Promise<void> {
    await this.runSerialized(true);
  }

  /** Startup discard: drains the file but does not fire onEvent. */
  async discard(): Promise<void> {
    await this.runSerialized(false);
  }

  private async runSerialized(emit: boolean): Promise<void> {
    if (this.inFlight) {
      this.pending = true;
      // Propagate the emit intent: if any coalesced caller wants to play, the
      // re-run must play. Otherwise a drain() overlapping a discard() would be
      // silently swallowed.
      if (emit) this.pendingEmit = true;
      return;
    }
    this.inFlight = true;
    try {
      let curEmit = emit;
      for (;;) {
        this.pending = false;
        this.pendingEmit = false;
        await this.drainOnce(curEmit);
        if (!this.pending) break;
        curEmit = this.pendingEmit;
      }
    } finally {
      this.inFlight = false;
    }
  }

  private async drainOnce(emit: boolean): Promise<void> {
    const drainingId = this.eventsId + DRAINING_SUFFIX;

    // Recover an orphaned draining file whose read failed on a previous cycle.
    if (this.orphan) {
      await this.consumeDraining(drainingId, emit);
      if (this.orphan) return; // still failing; don't clobber it with a fresh rename
    }

    try {
      await this.fs.rename(this.eventsId, drainingId);
      this.renameFailing = false;
    } catch (err) {
      if (isMissing(err)) {
        this.renameFailing = false;
        return; // empty file, or lost the atomic-rename race
      }
      if (!this.renameFailing) {
        this.log(`drain rename error: ${describe(err)}`);
        this.renameFailing = true; // log a persistent failure only once
      }
      return;
    }

    await this.consumeDraining(drainingId, emit);
  }

  // Reads, emits, and deletes the draining file. On a read error the file is left
  // in place (orphan) so the next cycle can retry it, preventing event loss.
  private async consumeDraining(drainingId: string, emit: boolean): Promise<void> {
    let content: string;
    try {
      content = await this.fs.readFile(drainingId);
    } catch (err) {
      if (isMissing(err)) {
        this.orphan = false;
        return;
      }
      if (!this.orphan) {
        this.log(`drain read error (will retry next cycle): ${describe(err)}`);
      }
      this.orphan = true;
      return;
    }
    await this.fs.delete(drainingId);
    this.orphan = false;
    if (emit) this.emitLines(content);
  }

  private emitLines(content: string): void {
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: RawEvent;
      try {
        parsed = JSON.parse(trimmed) as RawEvent;
      } catch {
        this.log(`skip malformed line: ${trimmed.slice(0, 120)}`);
        continue;
      }
      if (typeof parsed.event !== "string") {
        this.log(`skip line without event: ${trimmed.slice(0, 120)}`);
        continue;
      }
      this.onEvent(parsed);
    }
  }
}

function isMissing(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? "";
  return code === "ENOENT" || isNotFound(err);
}

function isNotFound(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? "";
  const code = (err as { code?: string })?.code ?? "";
  return name === "FileNotFound" || /entrynotfound|filenotfound/i.test(String(code) + name);
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
