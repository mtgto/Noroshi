import { describe, it, expect } from "vitest";
import { Player } from "../../player";
import { FakeCommandRunner, FakeClock } from "../fakes";

function make(opts: Partial<{ debounceMs: number; entrypointFilter: string[] }> = {}) {
  const runner = new FakeCommandRunner();
  const clock = new FakeClock(1000);
  const sounds: Record<string, string> = { notification: "/s/wait.wav", stop: "/s/done.wav" };
  const logs: string[] = [];
  const player = new Player({
    runner,
    clock,
    playerCommand: 'afplay "${file}"',
    soundFor: (k) => sounds[k] ?? null,
    debounceMs: opts.debounceMs ?? 250,
    entrypointFilter: opts.entrypointFilter ?? [],
    log: (m) => logs.push(m),
  });
  return { runner, clock, player, logs };
}

describe("Player.handle", () => {
  it("plays a known event with the correct command", () => {
    const { runner, player } = make();
    player.handle({ event: "stop" });
    expect(runner.calls).toEqual(['afplay "/s/done.wav"']);
  });

  it("skips and logs an unknown event", () => {
    const { runner, player, logs } = make();
    player.handle({ event: "weird" });
    expect(runner.calls).toEqual([]);
    expect(logs.some((l) => /weird/.test(l))).toBe(true);
  });

  it("suppresses the same event within the debounce window", () => {
    const { runner, clock, player } = make({ debounceMs: 250 });
    player.handle({ event: "stop" });
    clock.advance(100);
    player.handle({ event: "stop" }); // within window -> skip
    clock.advance(200); // 300ms total > 250
    player.handle({ event: "stop" }); // plays
    expect(runner.calls.length).toBe(2);
  });

  it("debounces each event kind independently", () => {
    const { runner, player } = make({ debounceMs: 250 });
    player.handle({ event: "stop" });
    player.handle({ event: "notification" }); // different kind -> plays
    expect(runner.calls.length).toBe(2);
  });

  it("plays only matching entrypoints when a filter is set", () => {
    const { runner, player } = make({ entrypointFilter: ["vscode"] });
    player.handle({ event: "stop", entrypoint: "cli" }); // no match -> skip
    player.handle({ event: "stop", entrypoint: "vscode" }); // match -> plays
    expect(runner.calls).toEqual(['afplay "/s/done.wav"']);
  });

  it("plays even without an entrypoint when the filter is empty", () => {
    const { runner, player } = make({ entrypointFilter: [] });
    player.handle({ event: "stop" });
    expect(runner.calls.length).toBe(1);
  });
});
