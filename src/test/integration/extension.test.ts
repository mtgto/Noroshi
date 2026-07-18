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

  test("plays a sound when a tool_start stays outstanding past the threshold", async () => {
    const folder = vscode.workspace.workspaceFolders![0].uri;
    const marker = path.join(os.tmpdir(), `noroshi-toolwait-${Date.now()}.txt`);

    const cfg = vscode.workspace.getConfiguration("noroshi");
    await cfg.update(
      "playerCommand",
      `node -e "require('fs').writeFileSync('${marker.replace(/\\/g, "/")}','1')"`,
      vscode.ConfigurationTarget.Workspace,
    );
    await cfg.update("pollInterval", 300, vscode.ConfigurationTarget.Workspace);
    await cfg.update("debounceMs", 0, vscode.ConfigurationTarget.Workspace);
    await cfg.update("toolWait.enabled", true, vscode.ConfigurationTarget.Workspace);
    await cfg.update("toolWait.thresholdMs", 500, vscode.ConfigurationTarget.Workspace);

    await sleep(500); // let the extension rebuild with the new settings

    const eventsPath = path.join(folder.fsPath, ".claude", "noroshi-events.jsonl");
    fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
    fs.appendFileSync(
      eventsPath,
      '{"event":"tool_start","session_id":"s1","prompt_id":"p1","tool_name":"Bash"}\n',
    );

    await waitFor(() => fs.existsSync(marker), 5000);
    assert.ok(fs.existsSync(marker), "toolWait sound should have played");

    await cfg.update("toolWait.enabled", undefined, vscode.ConfigurationTarget.Workspace);
    await cfg.update("toolWait.thresholdMs", undefined, vscode.ConfigurationTarget.Workspace);
  });

  test("a tool_end within the threshold plays nothing", async () => {
    const folder = vscode.workspace.workspaceFolders![0].uri;
    const marker = path.join(os.tmpdir(), `noroshi-toolwait-none-${Date.now()}.txt`);

    const cfg = vscode.workspace.getConfiguration("noroshi");
    await cfg.update(
      "playerCommand",
      `node -e "require('fs').writeFileSync('${marker.replace(/\\/g, "/")}','1')"`,
      vscode.ConfigurationTarget.Workspace,
    );
    await cfg.update("pollInterval", 300, vscode.ConfigurationTarget.Workspace);
    await cfg.update("toolWait.enabled", true, vscode.ConfigurationTarget.Workspace);
    await cfg.update("toolWait.thresholdMs", 2000, vscode.ConfigurationTarget.Workspace);

    await sleep(500);

    const eventsPath = path.join(folder.fsPath, ".claude", "noroshi-events.jsonl");
    fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
    fs.appendFileSync(
      eventsPath,
      '{"event":"tool_start","session_id":"s2","prompt_id":"p1","tool_name":"Bash"}\n' +
        '{"event":"tool_end","session_id":"s2","prompt_id":"p1","tool_name":"Bash"}\n',
    );

    await sleep(3000); // past the threshold
    assert.ok(!fs.existsSync(marker), "no sound should have played");

    await cfg.update("toolWait.enabled", undefined, vscode.ConfigurationTarget.Workspace);
    await cfg.update("toolWait.thresholdMs", undefined, vscode.ConfigurationTarget.Workspace);
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
