import { isAbsolutePath } from "./config";
import type { FileSystem } from "./fileSystem";
import { readIfPresent } from "./fsHelpers";

export interface HookCommand {
  type: "command";
  command: string;
}

export interface HookEntry {
  matcher?: string;
  hooks: HookCommand[];
}

/** The two Claude Code events Noroshi hooks into, each mapped to its entries. */
export type HooksConfig = Record<HookEvent, HookEntry[]>;

export type HookEvent = "Notification" | "Stop";

const HOOK_EVENTS: HookEvent[] = ["Notification", "Stop"];

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

export const SETTINGS_FILE: Record<SettingsTarget, string> = {
  local: "settings.local.json",
  shared: "settings.json",
};

export interface InstallHooksDeps {
  fs: FileSystem;
  /** id (URI string) of the .claude directory, for creating it before the first write. */
  dirId: string;
  /** ids (URI strings) of settings.local.json and settings.json. */
  fileIds: Record<SettingsTarget, string>;
  eventsFile: string;
  /** Prompts the user to pick a target when neither file's presence decides it alone. */
  askTarget: (choices: SettingsTarget[]) => Promise<SettingsTarget | undefined>;
}

export type InstallOutcome =
  | { kind: "cancelled" }
  | { kind: "unparsable"; target: SettingsTarget }
  | { kind: "unchanged"; target: SettingsTarget }
  | { kind: "installed"; target: SettingsTarget; resultKind: "created" | "updated" };

/**
 * Drives the full install: decide which settings file to use, merge the hooks in, and
 * write it back. Free of vscode so it can run under a plain FileSystem fake — all
 * user-facing messaging lives in the caller, keyed off the returned outcome.
 */
export async function installHooksCore(deps: InstallHooksDeps): Promise<InstallOutcome> {
  const { fs, dirId, fileIds, eventsFile, askTarget } = deps;

  const [localStat, sharedStat] = await Promise.all([
    fs.stat(fileIds.local),
    fs.stat(fileIds.shared),
  ]);
  const choice = pickSettingsTarget(localStat !== null, sharedStat !== null);
  const target = choice.kind === "decided" ? choice.target : await askTarget(choice.choices);
  if (!target) return { kind: "cancelled" };

  const existing = await readIfPresent(fs, fileIds[target]);
  const result = mergeHooks(existing, eventsFile);

  if (result.kind === "unparsable") return { kind: "unparsable", target };
  if (result.kind === "unchanged") return { kind: "unchanged", target };

  await fs.createDirectory(dirId);
  await fs.writeFile(fileIds[target], result.content);
  return { kind: "installed", target, resultKind: result.kind };
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
