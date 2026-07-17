import { describe, it, expect } from "vitest";
import { buildMenuItems, buildHookSnippet, type HookInterpreter } from "../../menu";

describe("buildMenuItems", () => {
  it("returns the expected actions in a fixed order", () => {
    const items = buildMenuItems(true);
    expect(items.map((i) => i.id)).toEqual([
      "copyHookSnippet",
      "openSetupGuide",
      "toggleEnabled",
      "showLog",
      "openSettings",
    ]);
  });

  it("labels the toggle as Disable when currently enabled", () => {
    const toggle = buildMenuItems(true).find((i) => i.id === "toggleEnabled");
    expect(toggle?.label).toMatch(/Disable/);
  });

  it("labels the toggle as Enable when currently disabled", () => {
    const toggle = buildMenuItems(false).find((i) => i.id === "toggleEnabled");
    expect(toggle?.label).toMatch(/Enable/);
  });
});

describe("buildHookSnippet", () => {
  it("produces valid JSON with a command hook for Notification, PermissionRequest, and Stop", () => {
    const parsed = JSON.parse(buildHookSnippet(".claude/noroshi-events.jsonl"));
    expect(parsed.hooks.Notification[0].hooks[0].type).toBe("command");
    expect(parsed.hooks.PermissionRequest[0].hooks[0].type).toBe("command");
    expect(parsed.hooks.Stop[0].hooks[0].type).toBe("command");
  });

  it("sends PermissionRequest through the same notification event kind as Notification", () => {
    const parsed = JSON.parse(buildHookSnippet(".claude/noroshi-events.jsonl"));
    expect(parsed.hooks.PermissionRequest[0].hooks[0].command).toContain('"event":"notification"');
  });

  it("targets a $CLAUDE_PROJECT_DIR-relative path for a relative eventsFile", () => {
    const parsed = JSON.parse(buildHookSnippet(".claude/noroshi-events.jsonl"));
    const cmd = parsed.hooks.Stop[0].hooks[0].command as string;
    expect(cmd).toContain('>> "$CLAUDE_PROJECT_DIR/.claude/noroshi-events.jsonl"');
    expect(cmd).toContain("# noroshi");
  });

  it("targets the literal path for an absolute eventsFile", () => {
    const parsed = JSON.parse(buildHookSnippet("/tmp/custom-events.jsonl"));
    const cmd = parsed.hooks.Notification[0].hooks[0].command as string;
    expect(cmd).toContain('>> "/tmp/custom-events.jsonl"');
    expect(cmd).not.toContain("CLAUDE_PROJECT_DIR");
  });

  it("embeds the correct event kind and the entrypoint discriminator", () => {
    const parsed = JSON.parse(buildHookSnippet(".claude/noroshi-events.jsonl"));
    expect(parsed.hooks.Stop[0].hooks[0].command).toContain('"event":"stop"');
    expect(parsed.hooks.Notification[0].hooks[0].command).toContain('"event":"notification"');
    expect(parsed.hooks.Stop[0].hooks[0].command).toContain("CLAUDE_CODE_ENTRYPOINT");
  });

  it("omits PreToolUse/PostToolUse when no interpreter is given", () => {
    const parsed = JSON.parse(buildHookSnippet(".claude/noroshi-events.jsonl"));
    expect(parsed.hooks.PreToolUse).toBeUndefined();
    expect(parsed.hooks.PostToolUse).toBeUndefined();
  });

  const interpreters: HookInterpreter[] = ["jq", "python3", "node", "ruby"];

  it.each(interpreters)("adds PreToolUse/PostToolUse command hooks for %s", (interp) => {
    const parsed = JSON.parse(buildHookSnippet(".claude/noroshi-events.jsonl", interp));
    expect(parsed.hooks.PreToolUse[0].hooks[0].type).toBe("command");
    expect(parsed.hooks.PostToolUse[0].hooks[0].type).toBe("command");
    expect(parsed.hooks.PreToolUse[0].hooks[0].command).toContain(interp);
    expect(parsed.hooks.PreToolUse[0].hooks[0].command).toContain('"tool_start"');
    expect(parsed.hooks.PostToolUse[0].hooks[0].command).toContain('"tool_end"');
  });

  it.each(interpreters)("emits the required fields on tool events for %s", (interp) => {
    const cmd = JSON.parse(buildHookSnippet(".claude/noroshi-events.jsonl", interp)).hooks
      .PreToolUse[0].hooks[0].command as string;
    expect(cmd).toContain("session_id");
    expect(cmd).toContain("prompt_id");
    expect(cmd).toContain("tool_name");
    expect(cmd).toContain("CLAUDE_CODE_ENTRYPOINT");
    expect(cmd).toContain('>> "$CLAUDE_PROJECT_DIR/.claude/noroshi-events.jsonl"');
  });

  it.each(interpreters)("switches Stop to the parser and drops tool_name for %s", (interp) => {
    const cmd = JSON.parse(buildHookSnippet(".claude/noroshi-events.jsonl", interp)).hooks.Stop[0]
      .hooks[0].command as string;
    expect(cmd).toContain(interp);
    expect(cmd).toContain("session_id");
    expect(cmd).toContain('"stop"');
    expect(cmd).not.toContain("tool_name");
  });

  it.each(interpreters)("leaves Notification on printf for %s", (interp) => {
    const cmd = JSON.parse(buildHookSnippet(".claude/noroshi-events.jsonl", interp)).hooks
      .Notification[0].hooks[0].command as string;
    expect(cmd).toContain("printf");
    expect(cmd).not.toContain("session_id");
  });

  it("never embeds tool_input", () => {
    for (const interp of interpreters) {
      const snippet = buildHookSnippet(".claude/noroshi-events.jsonl", interp);
      expect(snippet).not.toContain("tool_input");
    }
  });
});
