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
import { ToolWaitTracker } from "./toolWaitTracker";
import { RealTimers } from "./timers";
import { buildMenuItems, buildHookSnippet, type MenuActionId, type HookInterpreter } from "./menu";
import type { RawEvent } from "./types";

const SHOW_MENU = "noroshi.showMenu";
const EXTENSION_ID = "mtgto.noroshi";

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
  toolWaitEnabled: boolean;
}
let menuState: MenuState = {
  enabled: true,
  configured: false,
  eventsFile: "",
  toolWaitEnabled: false,
};

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("Noroshi");
  context.subscriptions.push(output);

  context.subscriptions.push(vscode.commands.registerCommand(SHOW_MENU, () => void showMenu()));

  const rebuild = () => {
    start(context).catch((err) => {
      output.appendLine(`start failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  };
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
    soundToolWait: c.get("sounds.toolWait", ""),
    playerCommand: resolvePlayerCommand(c.get("playerCommand", ""), platform),
    pollInterval: clampNonNegative(c.get("pollInterval", 3000), 3000),
    debounceMs: clampNonNegative(c.get("debounceMs", 250), 250),
    entrypointFilter: c.get("entrypointFilter", []),
    suppressWhenFocused: c.get("suppressWhenFocused", false),
    toolWaitEnabled: c.get("toolWait.enabled", false),
    toolWaitThresholdMs: clampNonNegative(c.get("toolWait.thresholdMs", 30000), 30000),
    statusBarShow: c.get("statusBar.show", true),
  };
}

async function start(context: vscode.ExtensionContext): Promise<void> {
  const gen = ++generation;
  disposeAll();
  const s = readSettings();
  menuState = {
    enabled: s.enabled,
    configured: false,
    eventsFile: s.eventsFile,
    toolWaitEnabled: s.toolWaitEnabled,
  };

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
    if (kind === "toolWait") return s.soundToolWait || bundled("waiting.wav");
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

  const tracker = s.toolWaitEnabled
    ? new ToolWaitTracker({
        timers: new RealTimers(),
        thresholdMs: s.toolWaitThresholdMs,
        onWait: (e) => player.handle(e),
        log: (m) => output.appendLine(m),
      })
    : null;
  if (tracker) disposer.push({ dispose: () => tracker.dispose() });

  // A real drain (not the startup discard) delivering an event proves the hook
  // works, even if it wasn't detected above (e.g. configured in ~/.claude/settings.json).
  const onDrainedEvent = (e: RawEvent) => {
    if (gen === generation && !menuState.configured) {
      confirmedEventsFile = s.eventsFile;
      menuState.configured = true;
      status.update("active", `Watching: ${s.eventsFile}`);
    }
    // tool_start/tool_end are control events: they drive the tracker's timer and
    // have no sound. Dropped even when the feature is off, so they don't fill the
    // log with "skip event without sound mapping".
    if (e.event === "tool_start" || e.event === "tool_end") {
      tracker?.handle(e);
      return;
    }
    if (e.event === "stop") tracker?.reset(e.session_id);
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

async function showMenu(): Promise<void> {
  const items = buildMenuItems(menuState.enabled).map((m) => ({
    label: m.label,
    description: m.description,
    id: m.id,
  }));
  const placeHolder = menuState.configured
    ? `Noroshi — hook configured, watching ${menuState.eventsFile}`
    : "Noroshi — hook not configured yet";
  const picked = await vscode.window.showQuickPick(items, { placeHolder });
  if (picked) await runMenuAction(picked.id);
}

async function runMenuAction(id: MenuActionId): Promise<void> {
  switch (id) {
    case "copyHookSnippet": {
      let interpreter: HookInterpreter | undefined;
      if (menuState.toolWaitEnabled) {
        interpreter = await pickInterpreter();
        if (!interpreter) return; // cancelled
      }
      await vscode.env.clipboard.writeText(buildHookSnippet(menuState.eventsFile, interpreter));
      void vscode.window.showInformationMessage("Noroshi: hook snippet copied to clipboard.");
      return;
    }
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

// Ordered by measured startup cost: the parser runs on every tool call and
// PreToolUse blocks until it exits, so the choice is a real latency trade-off.
const INTERPRETER_ITEMS: Array<{ label: HookInterpreter; description: string }> = [
  { label: "jq", description: "~6ms per hook — fastest" },
  { label: "python3", description: "~22ms per hook" },
  { label: "node", description: "~30ms per hook" },
  { label: "ruby", description: "~88ms per hook — slowest" },
];

async function pickInterpreter(): Promise<HookInterpreter | undefined> {
  const picked = await vscode.window.showQuickPick(INTERPRETER_ITEMS, {
    placeHolder: "Which JSON parser is available where Claude Code runs?",
  });
  return picked?.label;
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
