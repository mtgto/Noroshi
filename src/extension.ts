import * as vscode from "vscode";
import {
  resolvePlayerCommand,
  clampNonNegative,
  isAbsolutePath,
  type NoroshiSettings,
} from "./config";
import { VSCodeFileSystem } from "./fileSystem";
import { DrainCore } from "./eventSource";
import { WorkspaceEventSource } from "./workspaceEventSource";
import { Player, type SoundResolver } from "./player";
import { SpawnCommandRunner } from "./commandRunner";
import { RealClock } from "./clock";
import { checkHooksConfigured } from "./setupChecker";
import { NoroshiStatusBar } from "./statusBar";
import { buildMenuItems, type MenuActionId } from "./menu";
import { mergeHooks, pickSettingsTarget, type SettingsTarget } from "./hookInstaller";
import type { RawEvent } from "./types";

const SHOW_MENU = "noroshi.showMenu";
const INSTALL_HOOKS = "noroshi.installClaudeCodeHooks";
const EXTENSION_ID = "mtgto.noroshi";

const SETTINGS_FILE: Record<SettingsTarget, string> = {
  local: "settings.local.json",
  shared: "settings.json",
};

let disposer: vscode.Disposable[] = [];
let output: vscode.OutputChannel;
// Bumped on every start(); an in-flight run that finds itself superseded aborts
// after each await so overlapping config-change rebuilds don't race the disposer.
let generation = 0;

// eventsFile for which a real (non-discard) drain has actually delivered an event,
// proving the hook works end-to-end even if checkHooksConfigured can't see it (e.g.
// configured only in the user-level ~/.claude/settings.json). Keyed by eventsFile so
// changing the setting doesn't carry over a stale confirmation.
let confirmedEventsFile: string | null = null;

// Snapshot of the state the status-bar menu needs, kept current by start() so the
// menu command (invoked independently of start()'s lifecycle) always has an answer.
interface MenuState {
  enabled: boolean;
  configured: boolean;
  eventsFile: string;
}
let menuState: MenuState = { enabled: true, configured: false, eventsFile: "" };

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("Noroshi");
  context.subscriptions.push(output);

  const rebuild = () => {
    start(context).catch((err) => {
      output.appendLine(`start failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(SHOW_MENU, () => void showMenu(rebuild)),
    vscode.commands.registerCommand(INSTALL_HOOKS, () => void installHooks(rebuild)),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("noroshi")) rebuild();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(rebuild),
  );

  rebuild();
}

export function deactivate(): void {
  disposeAll();
}

function disposeAll(): void {
  for (const d of disposer) d.dispose();
  disposer = [];
}

function readSettings(): NoroshiSettings {
  const c = vscode.workspace.getConfiguration("noroshi");
  const platform = process.platform;
  return {
    enabled: c.get("enabled", true),
    eventsFile: c.get("eventsFile", ".claude/noroshi-events.jsonl"),
    soundNotification: c.get("sounds.notification", ""),
    soundStop: c.get("sounds.stop", ""),
    playerCommand: resolvePlayerCommand(c.get("playerCommand", ""), platform),
    pollInterval: clampNonNegative(c.get("pollInterval", 3000), 3000),
    debounceMs: clampNonNegative(c.get("debounceMs", 250), 250),
    entrypointFilter: c.get("entrypointFilter", []),
    suppressWhenFocused: c.get("suppressWhenFocused", false),
    statusBarShow: c.get("statusBar.show", true),
  };
}

async function start(context: vscode.ExtensionContext): Promise<void> {
  const gen = ++generation;
  disposeAll();
  const s = readSettings();
  menuState = { enabled: s.enabled, configured: false, eventsFile: s.eventsFile };

  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 0);
  const status = new NoroshiStatusBar(statusItem, SHOW_MENU);
  disposer.push(status);
  status.setVisible(s.statusBarShow);

  if (!s.enabled) {
    status.update("disabled", "Noroshi is disabled (noroshi.enabled). Click for options.");
    return;
  }

  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    status.update("unconfigured", "No folder is open");
    return;
  }

  const fs = new VSCodeFileSystem();
  const eventsUri = resolveEventsUri(s.eventsFile, folder.uri);
  const watchPattern = resolveWatchPattern(s.eventsFile, folder);

  const settingsIds = [
    vscode.Uri.joinPath(folder.uri, ".claude", "settings.json").toString(),
    vscode.Uri.joinPath(folder.uri, ".claude", "settings.local.json").toString(),
  ];
  const configured =
    (await checkHooksConfigured(fs, settingsIds, s.eventsFile)) ||
    confirmedEventsFile === s.eventsFile;
  if (gen !== generation) return; // superseded by a newer start() during the await
  menuState.configured = configured;
  status.update(
    configured ? "active" : "unconfigured",
    configured ? `Watching: ${s.eventsFile}` : "Hook not configured. Click for setup options.",
  );

  const bundled = (name: string) =>
    vscode.Uri.joinPath(context.extensionUri, "media", "sounds", name).fsPath;
  const soundFor: SoundResolver = (kind) => {
    if (kind === "notification") return s.soundNotification || bundled("waiting.wav");
    if (kind === "stop") return s.soundStop || bundled("done.wav");
    return null;
  };

  const player = new Player({
    runner: new SpawnCommandRunner(),
    clock: new RealClock(),
    playerCommand: s.playerCommand,
    soundFor,
    debounceMs: s.debounceMs,
    entrypointFilter: s.entrypointFilter,
    suppressWhenFocused: s.suppressWhenFocused,
    isFocused: () => vscode.window.state.focused,
    log: (m) => output.appendLine(m),
  });

  // A real drain (not the startup discard) delivering an event proves the hook
  // works, even if it wasn't detected above (e.g. configured in ~/.claude/settings.json).
  const onDrainedEvent = (e: RawEvent) => {
    if (gen === generation && !menuState.configured) {
      confirmedEventsFile = s.eventsFile;
      menuState.configured = true;
      status.update("active", `Watching: ${s.eventsFile}`);
    }
    player.handle(e);
  };

  const drain = new DrainCore(fs, eventsUri.toString(), onDrainedEvent, (m) =>
    output.appendLine(m),
  );

  // Discard events accumulated while the extension was stopped (do not play them).
  await drain.discard();
  if (gen !== generation) return; // superseded by a newer start() during the await

  const source = new WorkspaceEventSource(fs, eventsUri, watchPattern, drain, s.pollInterval);
  source.start();
  disposer.push({ dispose: () => source.dispose() });
}

function resolveEventsUri(eventsFile: string, folder: vscode.Uri): vscode.Uri {
  if (isAbsolutePath(eventsFile)) return folder.with({ path: toUriPath(eventsFile) });
  return vscode.Uri.joinPath(folder, ...eventsFile.split("/"));
}

function resolveWatchPattern(
  eventsFile: string,
  folder: vscode.WorkspaceFolder,
): vscode.RelativePattern {
  if (isAbsolutePath(eventsFile)) {
    const uriPath = toUriPath(eventsFile);
    const slash = uriPath.lastIndexOf("/");
    const dir = folder.uri.with({ path: uriPath.substring(0, slash) });
    return new vscode.RelativePattern(dir, uriPath.substring(slash + 1));
  }
  return new vscode.RelativePattern(folder, eventsFile);
}

/** Normalize an absolute filesystem path to a URI path (forward slashes, leading slash). */
function toUriPath(p: string): string {
  const norm = p.replace(/\\/g, "/");
  return norm.startsWith("/") ? norm : "/" + norm;
}

async function showMenu(rebuild: () => void): Promise<void> {
  const items = buildMenuItems(menuState.enabled).map((m) => ({
    label: m.label,
    description: m.description,
    id: m.id,
  }));
  const placeHolder = menuState.configured
    ? `Noroshi — hook configured, watching ${menuState.eventsFile}`
    : "Noroshi — hook not configured yet";
  const picked = await vscode.window.showQuickPick(items, { placeHolder });
  if (picked) await runMenuAction(picked.id, rebuild);
}

async function runMenuAction(id: MenuActionId, rebuild: () => void): Promise<void> {
  switch (id) {
    case "installHooks":
      await installHooks(rebuild);
      return;
    case "openSetupGuide":
      // Opens the extension's Details tab in the editor (renders README.md inline)
      // instead of a browser tab.
      void vscode.commands.executeCommand("extension.open", EXTENSION_ID);
      return;
    case "toggleEnabled": {
      const config = vscode.workspace.getConfiguration("noroshi");
      await config.update("enabled", !menuState.enabled, resolveEnabledTarget(config));
      return;
    }
    case "showLog":
      output.show(true);
      return;
    case "openSettings":
      void vscode.commands.executeCommand("workbench.action.openSettings", "@ext:mtgto.noroshi");
      return;
  }
}

/**
 * Write Noroshi's hooks into this workspace's .claude/settings(.local).json so users
 * don't have to hand-edit JSON. No confirmation is asked for — running the command is
 * the intent — but a file we can't parse is left strictly alone.
 */
async function installHooks(rebuild: () => void): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showWarningMessage("Noroshi: open a folder before installing hooks.");
    return;
  }
  const eventsFile = readSettings().eventsFile;
  const fs = new VSCodeFileSystem();
  const uriFor = (t: SettingsTarget) =>
    vscode.Uri.joinPath(folder.uri, ".claude", SETTINGS_FILE[t]);

  const [localStat, sharedStat] = await Promise.all([
    fs.stat(uriFor("local").toString()),
    fs.stat(uriFor("shared").toString()),
  ]);
  const choice = pickSettingsTarget(localStat !== null, sharedStat !== null);
  const target = choice.kind === "decided" ? choice.target : await askTarget(choice.choices);
  if (!target) return; // cancelled

  const uri = uriFor(target);
  const existing = await readIfPresent(fs, uri.toString());
  const result = mergeHooks(existing, eventsFile);

  if (result.kind === "unparsable") {
    const open = await vscode.window.showWarningMessage(
      `Noroshi: .claude/${SETTINGS_FILE[target]} isn't valid JSON, so it was left untouched. ` +
        "Fix it and run Install Hooks again, or add the hooks by hand.",
      "Open Setup Guide",
    );
    if (open) void vscode.commands.executeCommand("extension.open", EXTENSION_ID);
    return;
  }
  if (result.kind === "unchanged") {
    void vscode.window.showInformationMessage(
      `Noroshi: hooks are already installed in .claude/${SETTINGS_FILE[target]}.`,
    );
    return;
  }

  await fs.createDirectory(vscode.Uri.joinPath(folder.uri, ".claude").toString());
  await fs.writeFile(uri.toString(), result.content);
  output.appendLine(`installed hooks (${result.kind}) in .claude/${SETTINGS_FILE[target]}`);
  rebuild(); // re-evaluate the status bar now that the hooks are there

  const open = await vscode.window.showInformationMessage(
    `Noroshi: hooks installed in .claude/${SETTINGS_FILE[target]}.`,
    "Open File",
  );
  if (open) void vscode.window.showTextDocument(uri);
}

/** Ask which settings file to write to, preserving the caller's preference order. */
async function askTarget(choices: SettingsTarget[]): Promise<SettingsTarget | undefined> {
  const items = choices.map((target) => ({
    label: `.claude/${SETTINGS_FILE[target]}`,
    description:
      target === "local"
        ? "Personal, usually untracked by git (recommended)"
        : "Shared with everyone working on this repository",
    target,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Noroshi — where should the hooks be installed?",
  });
  return picked?.target;
}

async function readIfPresent(fs: VSCodeFileSystem, id: string): Promise<string | null> {
  try {
    return await fs.readFile(id);
  } catch {
    return null; // absent — mergeHooks creates the file from scratch
  }
}

/** Update at whichever scope currently overrides noroshi.enabled, defaulting to
 *  the workspace when a folder is open (matches where users typically toggle it). */
function resolveEnabledTarget(config: vscode.WorkspaceConfiguration): vscode.ConfigurationTarget {
  const info = config.inspect<boolean>("enabled");
  if (info?.workspaceValue !== undefined) return vscode.ConfigurationTarget.Workspace;
  if (info?.globalValue !== undefined) return vscode.ConfigurationTarget.Global;
  return vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
}
