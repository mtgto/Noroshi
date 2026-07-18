import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

// Drives the real noroshi.installClaudeCodeHooks command in a real extension host against the
// real workspace file system. Only the cases that need no QuickPick are covered here
// (no settings.local.json and no settings.json, or an existing settings.local.json),
// since the picker can't be driven headlessly; pickSettingsTarget is unit-tested
// separately, including the "only settings.json exists" case that would need one.
suite("Noroshi installHooks", () => {
  const folder = vscode.workspace.workspaceFolders![0].uri;
  const settingsPath = path.join(folder.fsPath, ".claude", "settings.json");
  const localSettingsPath = path.join(folder.fsPath, ".claude", "settings.local.json");

  setup(() => {
    fs.rmSync(path.join(folder.fsPath, ".claude"), { recursive: true, force: true });
  });

  // The command doesn't resolve until its final notification is dismissed, so these
  // fire it and wait on the file it writes rather than awaiting the command itself.
  test("creates .claude/settings.json when nothing exists", async () => {
    void vscode.commands.executeCommand("noroshi.installClaudeCodeHooks");
    await waitFor(() => fs.existsSync(settingsPath), 5000);

    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    for (const event of ["Notification", "PermissionRequest", "Stop"]) {
      const command = parsed.hooks[event][0].hooks[0].command as string;
      assert.strictEqual(parsed.hooks[event][0].hooks[0].type, "command");
      assert.ok(
        command.includes(".claude/noroshi-events.jsonl"),
        `${event} targets the events file`,
      );
    }
  });

  test("merges into an existing settings.local.json without dropping other hooks", async () => {
    fs.mkdirSync(path.dirname(localSettingsPath), { recursive: true });
    fs.writeFileSync(
      localSettingsPath,
      JSON.stringify({
        permissions: { allow: ["Bash(npm test)"] },
        hooks: {
          PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo mine" }] }],
        },
      }),
    );

    void vscode.commands.executeCommand("noroshi.installClaudeCodeHooks");
    await waitFor(() => readJson(localSettingsPath).hooks?.Stop !== undefined, 5000);

    const parsed = readJson(localSettingsPath);
    assert.deepStrictEqual(parsed.permissions.allow, ["Bash(npm test)"], "unrelated keys survive");
    assert.strictEqual(
      parsed.hooks.PreToolUse[0].hooks[0].command,
      "echo mine",
      "other hooks survive",
    );
    assert.strictEqual(parsed.hooks.Stop.length, 1);
  });

  test("leaves an unparsable settings.local.json untouched", async () => {
    fs.mkdirSync(path.dirname(localSettingsPath), { recursive: true });
    fs.writeFileSync(localSettingsPath, "{ not json");

    void vscode.commands.executeCommand("noroshi.installClaudeCodeHooks");
    await sleep(1000);

    assert.strictEqual(fs.readFileSync(localSettingsPath, "utf8"), "{ not json");
  });
});

function readJson(p: string): any {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

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
