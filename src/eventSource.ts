import type { FileSystem } from "./fileSystem";
import type { RawEvent } from "./types";

export const DRAINING_SUFFIX = ".draining";

export class DrainCore {
  private inFlight = false;
  private pending = false;

  constructor(
    private readonly fs: FileSystem,
    private readonly eventsId: string,
    private readonly onEvent: (e: RawEvent) => void,
    private readonly log: (msg: string) => void,
  ) {}

  /** rename→read→delete。onEvent を発火。直列化 + 保留再実行 1 回に畳む。 */
  async drain(): Promise<void> {
    await this.runSerialized(true);
  }

  /** 起動時破棄。onEvent は呼ばない。 */
  async discard(): Promise<void> {
    await this.runSerialized(false);
  }

  private async runSerialized(emit: boolean): Promise<void> {
    if (this.inFlight) {
      this.pending = true;
      return;
    }
    this.inFlight = true;
    try {
      do {
        this.pending = false;
        await this.drainOnce(emit);
      } while (this.pending);
    } finally {
      this.inFlight = false;
    }
  }

  private async drainOnce(emit: boolean): Promise<void> {
    const drainingId = this.eventsId + DRAINING_SUFFIX;
    try {
      await this.fs.rename(this.eventsId, drainingId);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return; // 空 or 競合の負け
      if (isNotFound(err)) return; // VSCode FileSystemError の不在系
      this.log(`drain rename error: ${describe(err)}`);
      return;
    }

    let content = "";
    try {
      content = await this.fs.readFile(drainingId);
    } catch (err) {
      this.log(`drain read error: ${describe(err)}`);
    }
    await this.fs.delete(drainingId);

    if (!emit) return;
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

function isNotFound(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? "";
  const code = (err as { code?: string })?.code ?? "";
  return name === "FileNotFound" || /entrynotfound|filenotfound/i.test(String(code) + name);
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
