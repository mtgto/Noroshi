import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

suite("Noroshi integration", () => {
  test("events ファイルへの追記で playerCommand が実行される", async () => {
    const folder = vscode.workspace.workspaceFolders![0].uri;
    const marker = path.join(os.tmpdir(), `noroshi-played-${Date.now()}.txt`);

    // playerCommand をマーカー書き込みに差し替え (実際の音は鳴らさない)
    const cfg = vscode.workspace.getConfiguration("noroshi");
    await cfg.update(
      "playerCommand",
      `node -e "require('fs').writeFileSync('${marker.replace(/\\/g, "/")}','1')"`,
      vscode.ConfigurationTarget.Workspace,
    );
    await cfg.update("pollInterval", 300, vscode.ConfigurationTarget.Workspace);
    await cfg.update("debounceMs", 0, vscode.ConfigurationTarget.Workspace);

    // 拡張の再構築を待つ
    await sleep(500);

    // events ファイルへ 1 行追記
    const eventsPath = path.join(folder.fsPath, ".claude", "noroshi-events.jsonl");
    fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
    fs.appendFileSync(eventsPath, '{"event":"stop"}\n');

    // watcher or poll が拾って再生されるのを待つ
    await waitFor(() => fs.existsSync(marker), 5000);
    assert.ok(fs.existsSync(marker), "player command should have run");
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(cond: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) return;
    await sleep(100);
  }
}
