import { describe, it, expect } from "vitest";
import { Player } from "../../player";
import { FakeCommandRunner, FakeClock } from "../fakes";

function make(
  opts: Partial<{
    debounceMs: number;
    entrypointFilter: string[];
    suppressWhenFocused: boolean;
    isFocused: () => boolean;
  }> = {},
) {
  const runner = new FakeCommandRunner();
  const clock = new FakeClock(1000);
  const sounds: Record<string, string> = { notification: "/s/wait.wav", stop: "/s/done.wav" };
  const logs: string[] = [];
  const player = new Player({
    runner,
    clock,
    playerCommand: ["afplay", "${file}"],
    soundFor: (k) => sounds[k] ?? null,
    debounceMs: opts.debounceMs ?? 250,
    entrypointFilter: opts.entrypointFilter ?? [],
    suppressWhenFocused: opts.suppressWhenFocused ?? false,
    isFocused: opts.isFocused ?? (() => false),
    env: { NOROSHI_WORKSPACE_NAME: "proj", NOROSHI_WORKSPACE_URI: "file:///w/proj" },
    log: (m) => logs.push(m),
  });
  return { runner, clock, player, logs };
}

describe("Player.handle", () => {
  it("plays a known event by substituting ${file} into the command's argv", () => {
    const { runner, player } = make();
    player.handle({ event: "stop" });
    expect(runner.calls).toEqual([["afplay", "/s/done.wav"]]);
  });

  it("passes the event kind and workspace info as environment variables", () => {
    const { runner, player } = make();
    player.handle({ event: "notification" });
    expect(runner.envs).toEqual([
      {
        NOROSHI_EVENT: "notification",
        NOROSHI_WORKSPACE_NAME: "proj",
        NOROSHI_WORKSPACE_URI: "file:///w/proj",
      },
    ]);
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
    expect(runner.calls).toEqual([["afplay", "/s/done.wav"]]);
  });

  it("plays even without an entrypoint when the filter is empty", () => {
    const { runner, player } = make({ entrypointFilter: [] });
    player.handle({ event: "stop" });
    expect(runner.calls.length).toBe(1);
  });
});

describe("Player.handle suppressWhenFocused", () => {
  it("does not play when suppressWhenFocused is true and the window is focused", () => {
    const { runner, player } = make({ suppressWhenFocused: true, isFocused: () => true });
    player.handle({ event: "stop" });
    expect(runner.calls).toEqual([]);
  });

  it("plays when suppressWhenFocused is true but the window is not focused", () => {
    const { runner, player } = make({ suppressWhenFocused: true, isFocused: () => false });
    player.handle({ event: "stop" });
    expect(runner.calls.length).toBe(1);
  });

  it("plays when suppressWhenFocused is false even if the window is focused", () => {
    const { runner, player } = make({ suppressWhenFocused: false, isFocused: () => true });
    player.handle({ event: "stop" });
    expect(runner.calls.length).toBe(1);
  });

  it("logs when suppressing due to focus", () => {
    const { player, logs } = make({ suppressWhenFocused: true, isFocused: () => true });
    player.handle({ event: "notification" });
    expect(logs.some((l) => /focused/.test(l) && /notification/.test(l))).toBe(true);
  });

  it("does not consume the debounce window when suppressed by focus", () => {
    // Suppressed while focused, then unfocuses -> the same event must still play,
    // proving suppression didn't update lastPlayed and trip the debounce check.
    let focused = true;
    const { runner, player } = make({
      suppressWhenFocused: true,
      isFocused: () => focused,
      debounceMs: 250,
    });
    player.handle({ event: "stop" }); // suppressed (focused)
    focused = false;
    player.handle({ event: "stop" }); // should play (not blocked by debounce)
    expect(runner.calls.length).toBe(1);
  });
});
