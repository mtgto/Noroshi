import type { Timers } from "./timers";
import type { RawEvent } from "./types";

export const TOOL_START = "tool_start";
export const TOOL_END = "tool_end";
export const TOOL_WAIT = "toolWait";

export interface ToolWaitTrackerOptions {
  timers: Timers;
  thresholdMs: number;
  onWait: (e: RawEvent) => void;
  log: (msg: string) => void;
}

interface SessionState {
  /**
   * Optional: requires Claude Code v2.1.196+ (older versions never send it on
   * PreToolUse/PostToolUse). Used opportunistically for turn-boundary
   * self-healing; its absence never blocks tracking.
   */
  promptId: string | undefined;
  count: number;
  timer: unknown | null;
  /** From the tool_start that armed the timer; for the log line only. */
  toolName: string;
  entrypoint?: string;
}

/**
 * Turns tool_start/tool_end hook events into a toolWait event when a tool stays
 * outstanding past the threshold.
 *
 * Hook payloads were assumed to carry no tool_use_id, but empirically they do
 * (confirmed on Claude Code 2.1.142 and 2.1.212). It is undocumented for
 * PostToolUse, though, so it is not relied on for correlation — only an
 * aggregate per-session count is tracked. That is enough for the question
 * being asked ("is any tool still outstanding?").
 *
 * The timer arms only on the 0 -> 1 transition. If the count gets stuck above
 * zero (a denied tool fires no PostToolUse), the timer is never re-armed, so
 * the feature goes silent rather than repeating. reset() on Stop recovers it
 * unconditionally; a prompt_id change recovers it opportunistically when the
 * Claude Code version sends prompt_id (v2.1.196+) — its absence (confirmed on
 * 2.1.142) never blocks event processing, only this bonus recovery path.
 */
export class ToolWaitTracker {
  private sessions = new Map<string, SessionState>();
  private warnedMissingPromptId = false;

  constructor(private readonly opts: ToolWaitTrackerOptions) {}

  handle(e: RawEvent): void {
    const sessionId = e.session_id;
    const toolName = e.tool_name;
    if (!sessionId || !toolName) {
      this.opts.log(`skip ${e.event} without session_id/tool_name (check the hook snippet)`);
      return;
    }

    const promptId = e.prompt_id;
    if (!promptId && !this.warnedMissingPromptId) {
      this.warnedMissingPromptId = true;
      this.opts.log(
        "tool_start/tool_end events are missing prompt_id — if this persists, update the " +
          "Claude Code VSCode extension to v2.1.196 or later for full turn-boundary recovery",
      );
    }

    let s = this.sessions.get(sessionId);
    if (s && promptId && s.promptId && s.promptId !== promptId) {
      // A new turn started. Anything still outstanding belonged to the previous
      // prompt and can no longer complete, so drop it rather than let it block
      // this turn's timer from arming. Only fires when both sides actually
      // have a prompt_id to compare — see the class doc comment.
      this.disarm(s);
      this.sessions.delete(sessionId);
      s = undefined;
    }
    if (!s) {
      s = { promptId, count: 0, timer: null, toolName, entrypoint: e.entrypoint };
      this.sessions.set(sessionId, s);
    }

    if (e.event === TOOL_START) {
      s.count += 1;
      if (s.count === 1) {
        s.toolName = toolName;
        s.entrypoint = e.entrypoint;
        this.arm(sessionId, s);
      }
      return;
    }

    if (e.event === TOOL_END) {
      if (s.count === 0) return; // no matching start (e.g. restarted mid-tool)
      s.count -= 1;
      if (s.count === 0) this.disarm(s);
    }
  }

  /** Drop a session's state entirely. Called on Stop; also keeps the map from growing. */
  reset(sessionId: string | undefined): void {
    if (!sessionId) return;
    const s = this.sessions.get(sessionId);
    if (!s) return;
    this.disarm(s);
    this.sessions.delete(sessionId);
  }

  dispose(): void {
    for (const s of this.sessions.values()) this.disarm(s);
    this.sessions.clear();
  }

  private arm(sessionId: string, s: SessionState): void {
    s.timer = this.opts.timers.setTimeout(() => {
      s.timer = null;
      this.opts.log(
        `tool wait: ${s.toolName} outstanding for ${this.opts.thresholdMs}ms (session ${sessionId})`,
      );
      this.opts.onWait({ event: TOOL_WAIT, entrypoint: s.entrypoint });
    }, this.opts.thresholdMs);
  }

  private disarm(s: SessionState): void {
    if (s.timer === null) return;
    this.opts.timers.clearTimeout(s.timer);
    s.timer = null;
  }
}
