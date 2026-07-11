import * as vscode from "vscode";
import { resolvePlayerCommand, clampNonNegative, type NoroshiSettings } from "./config";
import { VSCodeFileSystem } from "./fileSystem";
import { DrainCore } from "./eventSource";
import { WorkspaceEventSource } from "./workspaceEventSource";
import { Player, type SoundResolver } from "./player";
import { ExecCommandRunner } from "./commandRunner";
import { RealClock } from "./clock";
import { checkHooksConfigured } from "./setupChecker";
import { NoroshiStatusBar } from "./statusBar";
import type { RawEvent } from "./types";

const MARKER = "# noroshi";
const OPEN_GUIDE = "noroshi.openSetupGuide";
const README_URL = "https://github.com/mtgto/noroshi#setup";

let disposer: vscode.Disposable[] = [];
let output: vscode.OutputChannel;
// Bumped on every start(); an in-flight run that finds itself superseded aborts
// after each await so overlapping config-change rebuilds don't race the disposer.
let generation = 0;

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("Noroshi");
  context.subscriptions.push(output);

  context.subscriptions.push(
    vscode.commands.registerCommand(OPEN_GUIDE, () => {
      void vscode.env.openExternal(vscode.Uri.parse(README_URL));
    }),
  );

  const rebuild = () => void start(context);
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("noroshi")) rebuild();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(rebuild),
  );

  void start(context);
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
    statusBarShow: c.get("statusBar.show", true),
  };
}

async function start(context: vscode.ExtensionContext): Promise<void> {
  const gen = ++generation;
  disposeAll();
  const s = readSettings();

  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 0);
  const status = new NoroshiStatusBar(statusItem, OPEN_GUIDE);
  disposer.push(status);
  status.setVisible(s.statusBarShow);

  if (!s.enabled) {
    status.update("disabled", "Noroshi is disabled (noroshi.enabled)");
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
  const configured = await checkHooksConfigured(fs, settingsIds, MARKER);
  if (gen !== generation) return; // superseded by a newer start() during the await
  status.update(
    configured ? "active" : "unconfigured",
    configured
      ? `Watching: ${s.eventsFile}`
      : "Hook not configured. Click to open the setup guide (README).",
  );

  const bundled = (name: string) =>
    vscode.Uri.joinPath(context.extensionUri, "media", "sounds", name).fsPath;
  const soundFor: SoundResolver = (kind) => {
    if (kind === "notification") return s.soundNotification || bundled("waiting.wav");
    if (kind === "stop") return s.soundStop || bundled("done.wav");
    return null;
  };

  const player = new Player({
    runner: new ExecCommandRunner(),
    clock: new RealClock(),
    playerCommand: s.playerCommand,
    platform: process.platform,
    soundFor,
    debounceMs: s.debounceMs,
    entrypointFilter: s.entrypointFilter,
    log: (m) => output.appendLine(m),
  });

  const drain = new DrainCore(
    fs,
    eventsUri.toString(),
    (e: RawEvent) => player.handle(e),
    (m) => output.appendLine(m),
  );

  // Discard events accumulated while the extension was stopped (do not play them).
  await drain.discard();
  if (gen !== generation) return; // superseded by a newer start() during the await

  const source = new WorkspaceEventSource(fs, eventsUri, watchPattern, drain, s.pollInterval);
  source.start();
  disposer.push({ dispose: () => source.dispose() });
}

function resolveEventsUri(eventsFile: string, folder: vscode.Uri): vscode.Uri {
  if (isAbsolute(eventsFile)) return folder.with({ path: eventsFile });
  return vscode.Uri.joinPath(folder, ...eventsFile.split("/"));
}

function resolveWatchPattern(
  eventsFile: string,
  folder: vscode.WorkspaceFolder,
): vscode.RelativePattern {
  if (isAbsolute(eventsFile)) {
    const dir = folder.uri.with({ path: eventsFile.substring(0, eventsFile.lastIndexOf("/")) });
    const base = eventsFile.substring(eventsFile.lastIndexOf("/") + 1);
    return new vscode.RelativePattern(dir, base);
  }
  return new vscode.RelativePattern(folder, eventsFile);
}

function isAbsolute(p: string): boolean {
  return p.startsWith("/");
}
