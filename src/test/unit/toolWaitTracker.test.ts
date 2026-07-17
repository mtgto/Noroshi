import { describe, it, expect } from "vitest";
import { ToolWaitTracker } from "../../toolWaitTracker";
import { FakeTimers } from "../fakes";
import type { RawEvent } from "../../types";

const THRESHOLD = 30_000;

function make(thresholdMs = THRESHOLD) {
  const timers = new FakeTimers();
  const played: RawEvent[] = [];
  const logs: string[] = [];
  const tracker = new ToolWaitTracker({
    timers,
    thresholdMs,
    onWait: (e) => played.push(e),
    log: (m) => logs.push(m),
  });
  return { timers, played, logs, tracker };
}

/** A well-formed tool_start/tool_end line as the hook writes it. */
function ev(event: string, over: Partial<RawEvent> = {}): RawEvent {
  return {
    event,
    entrypoint: "claude-vscode",
    session_id: "s1",
    prompt_id: "p1",
    tool_name: "Bash",
    ...over,
  };
}

describe("ToolWaitTracker", () => {
  it("fires toolWait when a tool stays outstanding past the threshold", () => {
    const { timers, played, tracker } = make();
    tracker.handle(ev("tool_start"));
    timers.advance(THRESHOLD);
    expect(played.map((e) => e.event)).toEqual(["toolWait"]);
  });

  it("does not fire when the tool finishes within the threshold", () => {
    const { timers, played, tracker } = make();
    tracker.handle(ev("tool_start"));
    tracker.handle(ev("tool_end"));
    timers.advance(THRESHOLD);
    expect(played).toEqual([]);
  });

  it("still fires when only one of several parallel tools finishes", () => {
    const { timers, played, tracker } = make();
    tracker.handle(ev("tool_start"));
    tracker.handle(ev("tool_start"));
    tracker.handle(ev("tool_end"));
    timers.advance(THRESHOLD);
    expect(played.map((e) => e.event)).toEqual(["toolWait"]);
  });

  it("clamps the count at zero for a tool_end with no preceding tool_start", () => {
    const { timers, played, tracker } = make();
    tracker.handle(ev("tool_end")); // e.g. the extension restarted mid-tool
    tracker.handle(ev("tool_start"));
    tracker.handle(ev("tool_end"));
    timers.advance(THRESHOLD);
    expect(played).toEqual([]);
  });

  it("fires only once per outstanding period", () => {
    const { timers, played, tracker } = make();
    tracker.handle(ev("tool_start"));
    timers.advance(THRESHOLD);
    tracker.handle(ev("tool_start")); // count 1 -> 2, no re-arm
    timers.advance(THRESHOLD);
    expect(played.length).toBe(1);
  });

  it("re-arms after the count returns to zero", () => {
    const { timers, played, tracker } = make();
    tracker.handle(ev("tool_start"));
    tracker.handle(ev("tool_end")); // back to 0
    tracker.handle(ev("tool_start")); // 0 -> 1 again
    timers.advance(THRESHOLD);
    expect(played.length).toBe(1);
  });

  it("carries the entrypoint from the tool_start onto the synthesized event", () => {
    const { timers, played, tracker } = make();
    tracker.handle(ev("tool_start", { entrypoint: "cli" }));
    timers.advance(THRESHOLD);
    expect(played[0].entrypoint).toBe("cli");
  });

  it("drops a stale count when the prompt_id changes", () => {
    const { timers, played, tracker } = make();
    tracker.handle(ev("tool_start", { prompt_id: "p1" })); // denied: no tool_end
    timers.advance(THRESHOLD);
    expect(played.length).toBe(1);

    // Next turn: the p1 count must not keep the p2 timer from arming.
    tracker.handle(ev("tool_start", { prompt_id: "p2" }));
    timers.advance(THRESHOLD);
    expect(played.length).toBe(2);
  });

  it("keeps sessions independent", () => {
    const { timers, played, tracker } = make();
    tracker.handle(ev("tool_start", { session_id: "a" }));
    tracker.handle(ev("tool_end", { session_id: "b" })); // must not cancel a's timer
    timers.advance(THRESHOLD);
    expect(played.length).toBe(1);
  });

  it("reset() disarms only the named session", () => {
    const { timers, played, tracker } = make();
    tracker.handle(ev("tool_start", { session_id: "a" }));
    tracker.handle(ev("tool_start", { session_id: "b" }));
    tracker.reset("a");
    timers.advance(THRESHOLD);
    expect(played.length).toBe(1); // only b fires
  });

  it("reset(undefined) is a no-op", () => {
    const { timers, played, tracker } = make();
    tracker.handle(ev("tool_start"));
    tracker.reset(undefined);
    timers.advance(THRESHOLD);
    expect(played.length).toBe(1);
  });

  it.each([
    ["session_id", { session_id: undefined }],
    ["prompt_id", { prompt_id: undefined }],
    ["tool_name", { tool_name: undefined }],
  ])("ignores and logs a tool_start missing %s", (_field, over) => {
    const { timers, played, logs, tracker } = make();
    tracker.handle(ev("tool_start", over as Partial<RawEvent>));
    timers.advance(THRESHOLD);
    expect(played).toEqual([]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("tool_start");
  });

  it("ignores a line whose required fields are null", () => {
    const { timers, played, tracker } = make();
    // jq's {session_id} shorthand writes null when the key is absent upstream.
    tracker.handle({
      event: "tool_start",
      session_id: null,
      prompt_id: "p1",
      tool_name: "Bash",
    } as unknown as RawEvent);
    timers.advance(THRESHOLD);
    expect(played).toEqual([]);
  });

  it("dispose() leaves no pending timer", () => {
    const { timers, played, tracker } = make();
    tracker.handle(ev("tool_start"));
    expect(timers.pendingCount).toBe(1);
    tracker.dispose();
    expect(timers.pendingCount).toBe(0);
    timers.advance(THRESHOLD);
    expect(played).toEqual([]);
  });
});
