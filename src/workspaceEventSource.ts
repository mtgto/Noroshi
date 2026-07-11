import * as vscode from "vscode";
import type { FileSystem } from "./fileSystem";
import type { DrainCore } from "./eventSource";

/**
 * Watches the events file (push via createFileSystemWatcher, plus a polling safety net)
 * and runs DrainCore on change. Kept separate from DrainCore so DrainCore stays
 * vscode-free and loadable under vitest.
 */
export class WorkspaceEventSource {
  private watcher?: vscode.FileSystemWatcher;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly fs: FileSystem,
    private readonly eventsUri: vscode.Uri,
    private readonly watchPattern: vscode.RelativePattern,
    private readonly drain: DrainCore,
    private readonly pollInterval: number,
  ) {}

  start(): void {
    this.watcher = vscode.workspace.createFileSystemWatcher(this.watchPattern);
    const trigger = () => void this.drain.drain();
    this.watcher.onDidCreate(trigger);
    this.watcher.onDidChange(trigger);

    if (this.pollInterval > 0) {
      this.timer = setInterval(() => {
        void this.pollOnce();
      }, this.pollInterval);
    }
  }

  private async pollOnce(): Promise<void> {
    if ((await this.fs.stat(this.eventsUri.toString())) !== null) {
      void this.drain.drain();
    }
  }

  dispose(): void {
    this.watcher?.dispose();
    if (this.timer) clearInterval(this.timer);
  }
}
