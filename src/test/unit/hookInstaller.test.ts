import { describe, it, expect } from "vitest";
import { buildHookConfig, mergeHooks, pickSettingsTarget } from "../../hookInstaller";

const EVENTS_FILE = ".claude/noroshi-events.jsonl";

/** The command mergeHooks must consider "already present" for the given event kind. */
function commandFor(kind: "Notification" | "PermissionRequest" | "Stop", eventsFile: string) {
  return buildHookConfig(eventsFile)[kind][0].hooks[0].command;
}

function contentOf(result: ReturnType<typeof mergeHooks>): string {
  if (result.kind !== "created" && result.kind !== "updated") {
    throw new Error(`expected a written result, got ${result.kind}`);
  }
  return result.content;
}

describe("buildHookConfig", () => {
  it("covers Notification, PermissionRequest, and Stop with command hooks", () => {
    const cfg = buildHookConfig(EVENTS_FILE);
    expect(cfg.Notification[0].hooks[0].type).toBe("command");
    expect(cfg.PermissionRequest[0].hooks[0].type).toBe("command");
    expect(cfg.Stop[0].hooks[0].type).toBe("command");
  });

  it("sends PermissionRequest through the same notification event kind as Notification", () => {
    expect(commandFor("PermissionRequest", EVENTS_FILE)).toContain('"event":"notification"');
  });

  it("targets a $CLAUDE_PROJECT_DIR-relative path for a relative eventsFile", () => {
    const cmd = commandFor("Stop", EVENTS_FILE);
    expect(cmd).toContain('>> "$CLAUDE_PROJECT_DIR/.claude/noroshi-events.jsonl"');
    expect(cmd).toContain("# noroshi");
  });

  it("targets the literal path for an absolute eventsFile", () => {
    const cmd = commandFor("Notification", "/tmp/custom-events.jsonl");
    expect(cmd).toContain('>> "/tmp/custom-events.jsonl"');
    expect(cmd).not.toContain("CLAUDE_PROJECT_DIR");
  });

  it("embeds the correct event kind and the entrypoint discriminator", () => {
    expect(commandFor("Stop", EVENTS_FILE)).toContain('"event":"stop"');
    expect(commandFor("Notification", EVENTS_FILE)).toContain('"event":"notification"');
    expect(commandFor("Stop", EVENTS_FILE)).toContain("CLAUDE_CODE_ENTRYPOINT");
  });
});

describe("mergeHooks", () => {
  it("creates a whole settings file when none exists", () => {
    const result = mergeHooks(null, EVENTS_FILE);
    expect(result.kind).toBe("created");
    const parsed = JSON.parse(contentOf(result));
    expect(parsed.hooks.Notification[0].hooks[0].type).toBe("command");
    expect(parsed.hooks.PermissionRequest).toHaveLength(1);
    expect(parsed.hooks.Stop).toHaveLength(1);
  });

  it("writes content that checkHooksConfigured can detect via the eventsFile needle", () => {
    expect(contentOf(mergeHooks(null, EVENTS_FILE))).toContain(EVENTS_FILE);
  });

  it("adds all three events to an empty settings object", () => {
    const result = mergeHooks("{}", EVENTS_FILE);
    expect(result.kind).toBe("updated");
    const parsed = JSON.parse(contentOf(result));
    expect(Object.keys(parsed.hooks).sort()).toEqual(["Notification", "PermissionRequest", "Stop"]);
  });

  it("keeps unrelated hook events untouched", () => {
    const existing = JSON.stringify({
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "lint" }] }] },
    });
    const parsed = JSON.parse(contentOf(mergeHooks(existing, EVENTS_FILE)));
    expect(parsed.hooks.PreToolUse[0].matcher).toBe("Bash");
    expect(parsed.hooks.PreToolUse[0].hooks[0].command).toBe("lint");
    expect(parsed.hooks.Stop).toHaveLength(1);
  });

  it("appends to an event the user already uses without dropping their entry", () => {
    const existing = JSON.stringify({
      hooks: { Stop: [{ hooks: [{ type: "command", command: "say done" }] }] },
    });
    const parsed = JSON.parse(contentOf(mergeHooks(existing, EVENTS_FILE)));
    expect(parsed.hooks.Stop).toHaveLength(2);
    expect(parsed.hooks.Stop[0].hooks[0].command).toBe("say done");
    expect(parsed.hooks.Stop[1].hooks[0].command).toBe(commandFor("Stop", EVENTS_FILE));
  });

  it("preserves keys outside hooks", () => {
    const existing = JSON.stringify({ permissions: { allow: ["Bash(npm test)"] } });
    const parsed = JSON.parse(contentOf(mergeHooks(existing, EVENTS_FILE)));
    expect(parsed.permissions.allow).toEqual(["Bash(npm test)"]);
  });

  it("is a no-op when the same eventsFile is already installed", () => {
    const once = contentOf(mergeHooks(null, EVENTS_FILE));
    expect(mergeHooks(once, EVENTS_FILE).kind).toBe("unchanged");
  });

  it("leaves the stale entry alone and adds a new one when eventsFile changed", () => {
    const once = contentOf(mergeHooks(null, EVENTS_FILE));
    const parsed = JSON.parse(contentOf(mergeHooks(once, "/tmp/other.jsonl")));
    expect(parsed.hooks.Stop).toHaveLength(2);
    expect(parsed.hooks.Stop[0].hooks[0].command).toBe(commandFor("Stop", EVENTS_FILE));
    expect(parsed.hooks.Stop[1].hooks[0].command).toBe(commandFor("Stop", "/tmp/other.jsonl"));
  });

  it("refuses to touch a file it cannot parse", () => {
    expect(mergeHooks("{ not json", EVENTS_FILE).kind).toBe("unparsable");
  });

  it("refuses to touch a file whose top level is not an object", () => {
    expect(mergeHooks("[1, 2]", EVENTS_FILE).kind).toBe("unparsable");
    expect(mergeHooks("null", EVENTS_FILE).kind).toBe("unparsable");
  });

  it("refuses to touch a file whose hooks entries have unexpected shapes", () => {
    expect(mergeHooks(`{"hooks": "nope"}`, EVENTS_FILE).kind).toBe("unparsable");
    expect(mergeHooks(`{"hooks": {"Stop": "nope"}}`, EVENTS_FILE).kind).toBe("unparsable");
  });

  it("ends the written content with a trailing newline", () => {
    expect(contentOf(mergeHooks(null, EVENTS_FILE)).endsWith("\n")).toBe(true);
  });
});

describe("pickSettingsTarget", () => {
  it("silently uses settings.local.json when it exists", () => {
    expect(pickSettingsTarget(true, false)).toEqual({ kind: "decided", target: "local" });
    expect(pickSettingsTarget(true, true)).toEqual({ kind: "decided", target: "local" });
  });

  it("silently creates settings.json when neither file exists", () => {
    expect(pickSettingsTarget(false, false)).toEqual({ kind: "decided", target: "shared" });
  });

  it("asks when only settings.json exists, offering local first", () => {
    const result = pickSettingsTarget(false, true);
    expect(result.kind).toBe("ask");
    if (result.kind !== "ask") throw new Error("expected ask");
    expect(result.choices).toEqual(["local", "shared"]);
  });
});
