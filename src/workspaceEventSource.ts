import * as vscode from "vscode";
import type { FileSystem } from "./fileSystem";
import type { DrainCore } from "./eventSource";

/**
 * プッシュ主 (createFileSystemWatcher) + ポーリング従で監視し、変化時に DrainCore を回す。
 * DrainCore と別ファイルなのは、DrainCore を vscode 非依存に保ち vitest でロードできるようにするため。
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
