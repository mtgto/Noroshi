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
  it("既知イベントを正しいコマンドで再生", () => {
    const { runner, player } = make();
    player.handle({ event: "stop" });
    expect(runner.calls).toEqual(['afplay "/s/done.wav"']);
  });

  it("未知イベントは skip + log", () => {
    const { runner, player, logs } = make();
    player.handle({ event: "weird" });
    expect(runner.calls).toEqual([]);
    expect(logs.some((l) => /weird/.test(l))).toBe(true);
  });

  it("debounce 窓内の同種は鳴らさない", () => {
    const { runner, clock, player } = make({ debounceMs: 250 });
    player.handle({ event: "stop" });
    clock.advance(100);
    player.handle({ event: "stop" }); // 窓内 → skip
    clock.advance(200); // 合計 300ms > 250
    player.handle({ event: "stop" }); // 鳴る
    expect(runner.calls.length).toBe(2);
  });

  it("別種イベントは debounce が独立", () => {
    const { runner, player } = make({ debounceMs: 250 });
    player.handle({ event: "stop" });
    player.handle({ event: "notification" }); // 別種 → 鳴る
    expect(runner.calls.length).toBe(2);
  });

  it("entrypointFilter 指定時、一致のみ鳴らす", () => {
    const { runner, player } = make({ entrypointFilter: ["vscode"] });
    player.handle({ event: "stop", entrypoint: "cli" }); // 不一致 → skip
    player.handle({ event: "stop", entrypoint: "vscode" }); // 一致 → 鳴る
    expect(runner.calls).toEqual(['afplay "/s/done.wav"']);
  });

  it("entrypointFilter 空なら entrypoint 無しでも鳴らす", () => {
    const { runner, player } = make({ entrypointFilter: [] });
    player.handle({ event: "stop" });
    expect(runner.calls.length).toBe(1);
  });
});
