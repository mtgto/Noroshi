import { isAbsolutePath } from "./config";

export interface HookCommand {
  type: "command";
  command: string;
}

export interface HookEntry {
  matcher?: string;
  hooks: HookCommand[];
}

/** The three Claude Code events Noroshi hooks into, each mapped to its entries. */
export type HooksConfig = Record<HookEvent, HookEntry[]>;

export type HookEvent = "Notification" | "PermissionRequest" | "Stop";

const HOOK_EVENTS: HookEvent[] = ["Notification", "PermissionRequest", "Stop"];

export type MergeResult =
  | { kind: "created"; content: string }
  | { kind: "updated"; content: string }
  | { kind: "unchanged" }
  | { kind: "unparsable" };

export type SettingsTarget = "local" | "shared";

export type TargetChoice =
  | { kind: "decided"; target: SettingsTarget }
  | { kind: "ask"; choices: SettingsTarget[] };

/**
 * Build the Claude Code hooks config for the current eventsFile setting. A relative
 * eventsFile is anchored under $CLAUDE_PROJECT_DIR; an absolute one (a remote/Pod
 * path) is used as-is.
 */
export function buildHookConfig(eventsFile: string): HooksConfig {
  const target = isAbsolutePath(eventsFile) ? eventsFile : `$CLAUDE_PROJECT_DIR/${eventsFile}`;
  return {
    Notification: [entry(hookCommand("notification", target))],
    // Fires in both the terminal CLI and the VSCode extension (verified on
    // 2.1.207 for both the tool-permission dialog and the AskUserQuestion
    // elicitation dialog) — this is what actually gets Noroshi its sound in
    // the extension, where Notification alone does not fire
    // (github.com/anthropics/claude-code/issues/8985#issuecomment-3798023834).
    PermissionRequest: [entry(hookCommand("notification", target))],
    Stop: [entry(hookCommand("stop", target))],
  };
}

/**
 * Merge Noroshi's hooks into an existing .claude/settings(.local).json, adding only
 * what is missing and leaving everything else — other events, other tools' entries,
 * the user's own hooks — in place.
 *
 * Entries are matched by exact command string, so re-running after changing
 * eventsFile leaves the stale entry behind rather than guessing which entries are
 * ours to delete. A stale entry only appends to a file nobody watches; deleting an
 * entry a user hand-tuned would be the worse failure.
 *
 * Reformatting is unavoidable (the file goes through JSON.parse), so anything we
 * cannot fully understand is reported as unparsable and left untouched.
 */
export function mergeHooks(existing: string | null, eventsFile: string): MergeResult {
  const config = buildHookConfig(eventsFile);
  if (existing === null) {
    return { kind: "created", content: serialize({ hooks: config }) };
  }

  let root: unknown;
  try {
    root = JSON.parse(existing);
  } catch {
    return { kind: "unparsable" };
  }
  if (!isPlainObject(root)) return { kind: "unparsable" };

  const hooks = root.hooks === undefined ? {} : root.hooks;
  if (!isPlainObject(hooks)) return { kind: "unparsable" };
  if (HOOK_EVENTS.some((e) => hooks[e] !== undefined && !Array.isArray(hooks[e]))) {
    return { kind: "unparsable" };
  }

  const merged: Record<string, unknown> = { ...hooks };
  let changed = false;
  for (const event of HOOK_EVENTS) {
    const command = config[event][0].hooks[0].command;
    const current = (merged[event] as unknown[] | undefined) ?? [];
    if (current.some((e) => hasCommand(e, command))) continue;
    merged[event] = [...current, entry(command)];
    changed = true;
  }
  if (!changed) return { kind: "unchanged" };

  return { kind: "updated", content: serialize({ ...root, hooks: merged }) };
}

/**
 * Decide which settings file to install into. settings.local.json is preferred
 * because Noroshi is a personal preference and that file is normally untracked,
 * so we only ask when choosing settings.json would mean adding to a file the
 * user likely shares with their team.
 */
export function pickSettingsTarget(hasLocal: boolean, hasShared: boolean): TargetChoice {
  if (hasLocal) return { kind: "decided", target: "local" };
  if (!hasShared) return { kind: "decided", target: "shared" };
  return { kind: "ask", choices: ["local", "shared"] };
}

function entry(command: string): HookEntry {
  return { hooks: [{ type: "command", command }] };
}

function hookCommand(kind: "notification" | "stop", target: string): string {
  return (
    `printf '{"event":"${kind}","entrypoint":"%s"}\\n' ` +
    `"\${CLAUDE_CODE_ENTRYPOINT:-unknown}" >> "${target}"  # noroshi`
  );
}

function hasCommand(entry: unknown, command: string): boolean {
  if (!isPlainObject(entry) || !Array.isArray(entry.hooks)) return false;
  return entry.hooks.some((h) => isPlainObject(h) && h.command === command);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function serialize(root: unknown): string {
  return JSON.stringify(root, null, 2) + "\n";
}
