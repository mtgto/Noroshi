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
  it("parses every line, fires onEvent, and removes the file", async () => {
    const { fs, events, core } = make({
      [EV]: '{"event":"stop"}\n{"event":"notification","entrypoint":"vscode"}\n',
    });
    await core.drain();
    expect(events).toEqual([{ event: "stop" }, { event: "notification", entrypoint: "vscode" }]);
    expect(await fs.stat(EV)).toBeNull();
    expect(await fs.stat(EV + DRAINING_SUFFIX)).toBeNull();
  });

  it("no-ops when the events file is absent (ENOENT swallowed)", async () => {
    const { events, logs, core } = make();
    await core.drain();
    expect(events).toEqual([]);
    expect(logs.join()).not.toMatch(/error/i);
  });

  it("skips malformed lines but processes the rest and logs", async () => {
    const { events, logs, core } = make({ [EV]: 'not-json\n{"event":"stop"}\n' });
    await core.drain();
    expect(events).toEqual([{ event: "stop" }]);
    expect(logs.some((l) => /skip/i.test(l))).toBe(true);
  });

  it("delivers each line exactly once under concurrent drains", async () => {
    const { events, core } = make({ [EV]: '{"event":"stop"}\n' });
    await Promise.all([core.drain(), core.drain()]);
    expect(events).toEqual([{ event: "stop" }]);
  });

  it("picks up an append that arrives mid-drain via the coalesced re-run", async () => {
    const { fs, events, core } = make({ [EV]: '{"event":"stop"}\n' });
    const orig = fs.readFile.bind(fs);
    let injected = false;
    vi.spyOn(fs, "readFile").mockImplementation(async (id: string) => {
      const out = await orig(id);
      if (!injected) {
        injected = true;
        fs.append(EV, '{"event":"notification"}\n'); // append to the fresh events file
        void core.drain(); // simulate the watcher re-firing -> coalesced into pending
      }
      return out;
    });
    await core.drain();
    expect(events).toEqual([{ event: "stop" }, { event: "notification" }]);
  });

  it("discard removes the file without firing onEvent", async () => {
    const { fs, events, core } = make({ [EV]: '{"event":"stop"}\n' });
    await core.discard();
    expect(events).toEqual([]);
    expect(await fs.stat(EV)).toBeNull();
  });

  it("preserves and later delivers events when a read transiently fails", async () => {
    const { fs, events, core } = make({ [EV]: '{"event":"stop"}\n' });
    const orig = fs.readFile.bind(fs);
    let failOnce = true;
    vi.spyOn(fs, "readFile").mockImplementation(async (id: string) => {
      if (failOnce && id === EV + DRAINING_SUFFIX && fs.has(EV + DRAINING_SUFFIX)) {
        failOnce = false;
        throw new Error("transient read error");
      }
      return orig(id);
    });
    await core.drain(); // rename ok, read fails -> orphan preserved, nothing emitted
    expect(events).toEqual([]);
    expect(fs.has(EV + DRAINING_SUFFIX)).toBe(true);
    await core.drain(); // recovers the orphan
    expect(events).toEqual([{ event: "stop" }]);
    expect(fs.has(EV + DRAINING_SUFFIX)).toBe(false);
  });

  it("logs a persistent rename error only once across cycles", async () => {
    const { fs, logs, core } = make({ [EV]: '{"event":"stop"}\n' });
    vi.spyOn(fs, "rename").mockRejectedValue(new Error("EPERM: locked"));
    await core.drain();
    await core.drain();
    expect(logs.filter((l) => /rename error/.test(l)).length).toBe(1);
  });

  it("a drain() arriving during discard() still plays its events", async () => {
    const { fs, events, core } = make({ [EV]: '{"event":"stop"}\n' });
    const orig = fs.readFile.bind(fs);
    let injected = false;
    vi.spyOn(fs, "readFile").mockImplementation(async (id: string) => {
      const out = await orig(id);
      if (!injected) {
        injected = true;
        fs.append(EV, '{"event":"notification"}\n'); // arrives while discard is draining
        void core.drain(); // real event -> must be played, not discarded
      }
      return out;
    });
    await core.discard();
    // the initial 'stop' is discarded (startup), but the drain()'s 'notification' plays
    expect(events).toEqual([{ event: "notification" }]);
  });
});
