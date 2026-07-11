# Noroshi

A VSCode extension that plays a local sound effect when Claude Code (the VSCode
extension) is "waiting for you" or "finished", even when Claude Code runs inside
a Remote Container on a Kubernetes Pod.

日本語版は [README.ja.md](README.ja.md) を参照してください。

## How it works

A Claude Code hook appends one line to an events file on the Pod
(`.claude/noroshi-events.jsonl`), and Noroshi — a local UI extension — watches
that file via `vscode.workspace.fs` and plays a sound on your machine.

The extension declares `extensionKind: ["ui"]`, so it **runs on your local
machine**, which is what lets it play local commands like `afplay`. The file it
watches lives on the remote (Pod), but it is reachable through the workspace file
system.

## Setup

### 1. Configure the hook (manual)

Add the following to `.claude/settings.json` (Noroshi never edits `settings.json`
itself):

```json
{
  "hooks": {
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "printf '{\"event\":\"notification\",\"entrypoint\":\"%s\"}\\n' \"${CLAUDE_CODE_ENTRYPOINT:-unknown}\" >> \"$CLAUDE_PROJECT_DIR/.claude/noroshi-events.jsonl\"  # noroshi"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "printf '{\"event\":\"stop\",\"entrypoint\":\"%s\"}\\n' \"${CLAUDE_CODE_ENTRYPOINT:-unknown}\" >> \"$CLAUDE_PROJECT_DIR/.claude/noroshi-events.jsonl\"  # noroshi"
          }
        ]
      }
    ]
  }
}
```

If you change `noroshi.eventsFile`, update the append target to match.

### 2. Status bar

`🔊 Noroshi` means the hook was detected. `⚠️ Noroshi` means the hook is not
configured (click it to open this guide).

## Settings

| Setting | Default | Description |
|---|---|---|
| `noroshi.enabled` | `true` | Enable/disable Noroshi |
| `noroshi.eventsFile` | `.claude/noroshi-events.jsonl` | File to watch (relative = workspace-based, absolute = an absolute path on the remote Pod) |
| `noroshi.sounds.notification` / `.stop` | `""` | Override sound (empty = bundled WAV) |
| `noroshi.playerCommand` | `""` | Playback command. `${file}` is substituted. Empty = OS default |
| `noroshi.pollInterval` | `3000` | Safety-net polling interval (ms). 0 disables it |
| `noroshi.debounceMs` | `250` | Suppression window (ms) for repeats of the same event |
| `noroshi.entrypointFilter` | `[]` | e.g. `["vscode"]` to play only extension sessions |
| `noroshi.statusBar.show` | `true` | Show the status bar item |

### Audio format

The bundled defaults are WAV (the lowest common denominator every OS's default
command can play). You may point `sounds.*` at any format (playability depends on
`playerCommand`). On macOS, `afplay` also plays mp3/m4a. To use mp3/m4a by
default, set `playerCommand` to something like `ffplay -nodisp -autoexit ${file}`.

### Default playback commands

`${file}` is replaced with a shell-quoted path, so do **not** wrap `${file}` in
quotes yourself in the template.

- macOS: `afplay ${file}`
- Linux: `paplay ${file}` (falls back to `aplay`)
- Windows: `powershell -NoProfile -c "(New-Object Media.SoundPlayer ${file}).PlaySync()"` (WAV only)

## Filtering by session type (entrypoint)

To play only for the extension (side panel) sessions and not for `claude` in the
integrated terminal, first measure the discriminator. Temporarily install this
hook, complete a response in both the extension side panel and the integrated
terminal `claude`, then diff the two blocks in `~/noroshi-env-debug.txt` to find
a variable that reliably differs (candidate: `CLAUDE_CODE_ENTRYPOINT`).

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "{ echo '=== '\"$(date)\"; env | grep -iE 'claude|vscode|term_program|entrypoint'; } >> \"$HOME/noroshi-env-debug.txt\""
          }
        ]
      }
    ]
  }
}
```

Set the extension's value into `noroshi.entrypointFilter` (e.g. `["vscode"]`).

## Local development

### Run via F5 (fastest, local)

1. Open this folder (`noroshi`) in VSCode.
2. Run `npm install` if you have not already.
3. Press **F5** (Run → Start Debugging). An **Extension Development Host** window
   opens with Noroshi loaded (`preLaunchTask` compiles automatically).
4. In that window, open any folder (one that has a `.claude/` directory is
   convenient).

Quick sound test (no Claude needed) — playback fires whenever a line lands in the
events file:

```sh
mkdir -p .claude
echo '{"event":"stop"}' >> .claude/noroshi-events.jsonl   # done sound
echo '{"event":"notification"}' >> .claude/noroshi-events.jsonl   # waiting sound
```

Note: the extension **discards existing events on startup**, so append *after* it
is running. The events file is drained (deleted) right after it is read, so it
normally does not exist at rest — that is expected. Logs are in the Output panel's
**Noroshi** channel.

### Install into VSCode (VSIX)

```sh
npx @vscode/vsce package        # produces noroshi-0.0.1.vsix (warnings are OK)
code --install-extension noroshi-0.0.1.vsix
```

Or use the Extensions panel → `…` → **Install from VSIX**. Because Noroshi is a
`["ui"]` extension, it installs on the local (UI) side — which is what you want
for the Remote Container use case.

### Scripts

```sh
npm test              # unit tests (vitest)
npm run compile       # tsc build (out/)
npm run lint          # oxlint
npm run format        # oxfmt
npm run test:integration  # integration test (launches a real VSCode; CI needs xvfb-run)
npm run gen-sounds    # regenerate the bundled WAVs
```

## Manual smoke test (Remote Container)

1. Open a folder inside the Remote Container.
2. Configure the hook above.
3. Have Claude Code respond to something and confirm the `Stop` sound plays on
   your local machine.
4. Even where `createFileSystemWatcher` does not fire, a sound after `pollInterval`
   confirms the polling safety net is working.
