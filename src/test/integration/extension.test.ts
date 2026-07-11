import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

suite("Noroshi integration", () => {
  test("appending to the events file runs the player command", async () => {
    const folder = vscode.workspace.workspaceFolders![0].uri;
    const marker = path.join(os.tmpdir(), `noroshi-played-${Date.now()}.txt`);

    // Replace playerCommand with a marker write (no real sound is played).
    const cfg = vscode.workspace.getConfiguration("noroshi");
    await cfg.update(
      "playerCommand",
      `node -e "require('fs').writeFileSync('${marker.replace(/\\/g, "/")}','1')"`,
      vscode.ConfigurationTarget.Workspace,
    );
    await cfg.update("pollInterval", 300, vscode.ConfigurationTarget.Workspace);
    await cfg.update("debounceMs", 0, vscode.ConfigurationTarget.Workspace);

    // Wait for the extension to rebuild.
    await sleep(500);

    // Append one line to the events file.
    const eventsPath = path.join(folder.fsPath, ".claude", "noroshi-events.jsonl");
    fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
    fs.appendFileSync(eventsPath, '{"event":"stop"}\n');

    // Wait for the watcher or poll to pick it up and play.
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
