import { describe, it, expect, vi } from "vitest";
import { FakeFileSystem } from "../fakes";
import { DrainCore, DRAINING_SUFFIX } from "../../eventSource";
import type { RawEvent } from "../../types";

const EV = "mem://events";

function make(initial: Record<string, string> = {}) {
  const fs = new FakeFileSystem(initial);
  const events: RawEvent[] = [];
  const logs: string[] = [];
  const core = new DrainCore(
    fs,
    EV,
    (e) => events.push(e),
    (m) => logs.push(m),
  );
  return { fs, events, logs, core };
}

describe("DrainCore.drain", () => {
  it("全行を parse して onEvent に渡し、ファイルを消す", async () => {
    const { fs, events, core } = make({
      [EV]: '{"event":"stop"}\n{"event":"notification","entrypoint":"vscode"}\n',
    });
    await core.drain();
    expect(events).toEqual([{ event: "stop" }, { event: "notification", entrypoint: "vscode" }]);
    expect(await fs.stat(EV)).toBeNull();
    expect(await fs.stat(EV + DRAINING_SUFFIX)).toBeNull();
  });

  it("イベントファイルが無ければ no-op (ENOENT を握る)", async () => {
    const { events, logs, core } = make();
    await core.drain();
    expect(events).toEqual([]);
    expect(logs.join()).not.toMatch(/error/i);
  });

  it("壊れた行は skip し、他行は処理・ログを残す", async () => {
    const { events, logs, core } = make({ [EV]: 'not-json\n{"event":"stop"}\n' });
    await core.drain();
    expect(events).toEqual([{ event: "stop" }]);
    expect(logs.some((l) => /skip/i.test(l))).toBe(true);
  });

  it("同時に 2 回 drain しても各行は 1 回だけ (exactly-once)", async () => {
    const { events, core } = make({ [EV]: '{"event":"stop"}\n' });
    await Promise.all([core.drain(), core.drain()]);
    expect(events).toEqual([{ event: "stop" }]);
  });

  it("drain 中に来た追記通知は、畳まれた保留再実行で拾う", async () => {
    const { fs, events, core } = make({ [EV]: '{"event":"stop"}\n' });
    const orig = fs.readFile.bind(fs);
    let injected = false;
    vi.spyOn(fs, "readFile").mockImplementation(async (id: string) => {
      const out = await orig(id);
      if (!injected) {
        injected = true;
        fs.append(EV, '{"event":"notification"}\n'); // 新しい events ファイルへの追記
        void core.drain(); // watcher 再発火を模す → inFlight 中なので pending に畳まれる
      }
      return out;
    });
    await core.drain();
    expect(events).toEqual([{ event: "stop" }, { event: "notification" }]);
  });

  it("discard は消すが onEvent を呼ばない", async () => {
    const { fs, events, core } = make({ [EV]: '{"event":"stop"}\n' });
    await core.discard();
    expect(events).toEqual([]);
    expect(await fs.stat(EV)).toBeNull();
  });
});
