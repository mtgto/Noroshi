# Noroshi

A VSCode extension that plays a local sound effect when Claude Code (the VSCode
extension) is "waiting for you" or "finished", even when Claude Code runs inside
a Dev Container — whether that container is a local Docker container or a
Kubernetes Pod.

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
    "PermissionRequest": [
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

Both hooks fire in the terminal CLI. In the VSCode extension, `Notification`
does not currently fire at all — this was a known upstream bug where the
extension's `processControlRequest()` had no handler for the `Notification` /
`PermissionRequest` control-request subtypes (see
[anthropics/claude-code#8985 (comment)](https://github.com/anthropics/claude-code/issues/8985#issuecomment-3798023834)
for the root-cause analysis, and
[#16114](https://github.com/anthropics/claude-code/issues/16114) for the
original report). `PermissionRequest`, however, **has since been fixed** and
was confirmed working in the extension (Claude Code 2.1.207) for both the
tool-permission dialog (e.g. Write/Edit/Bash) and the `AskUserQuestion`
elicitation dialog — this is the one that actually gets Noroshi its sound in
the extension today. `Notification` is kept in the snippet anyway since it's
harmless and still covers terminal CLI cases (like `idle_prompt`) that
`PermissionRequest` doesn't.

One known gap: the sandbox's "Allow network connection to this host?" dialog
(shown e.g. for `curl`) does not fire either hook, on appearance or after a
choice is made — it appears to go through a separate, still-unhooked code
path. There's currently no way for Noroshi to catch that one.

If you change `noroshi.eventsFile`, update the append target to match.

### 2. Status bar

`🔊 Noroshi` means the hook was detected. `⚠️ Noroshi` means the hook is not
configured. Click it (or run **Noroshi: Show Menu** from the Command Palette) to
open a menu with: copy the hook snippet to the clipboard (pre-filled with your
`noroshi.eventsFile`), open this setup guide, enable/disable Noroshi, show the
output log, and open Noroshi's settings.

## Settings

| Setting | Default | Description |
|---|---|---|
| `noroshi.enabled` | `true` | Enable/disable Noroshi |
| `noroshi.eventsFile` | `.claude/noroshi-events.jsonl` | File to watch (relative = workspace-based, absolute = an absolute path on the remote Pod) |
| `noroshi.sounds.notification` / `.stop` | `""` | Override sound (empty = bundled WAV) |
| `noroshi.playerCommand` | `""` | Playback command. `${file}` is substituted. Empty = OS default |
| `noroshi.pollInterval` | `3000` | Safety-net polling interval (ms). 0 disables it |
| `noroshi.debounceMs` | `250` | Suppression window (ms) for repeats of the same event |
| `noroshi.entrypointFilter` | `[]` | e.g. `["claude-vscode"]` to play only extension sessions |
| `noroshi.suppressWhenFocused` | `false` | Don't play a sound while this VSCode window is focused |
| `noroshi.statusBar.show` | `true` | Show the status bar item |

`eventsFile`, `playerCommand`, and `sounds.*` run a local command or touch a local
file, so they are restricted under [VSCode Workspace
Trust](https://code.visualstudio.com/docs/editor/workspace-trust): in an untrusted
workspace, a workspace/folder-level override of these is ignored, falling back to
the user/default value (which Noroshi keeps operating on normally).

### Audio format

The bundled defaults are WAV (the lowest common denominator every OS's default
command can play). You may point `sounds.*` at any format (playability depends on
`playerCommand`). On macOS, `afplay` also plays mp3/m4a. To use mp3/m4a by
default, set `playerCommand` to something like `ffplay -nodisp -autoexit ${file}`.

### Default playback commands

`playerCommand` is split into argv tokens and run directly — **no shell** is
involved, so `${file}` is substituted as a single literal argument regardless of
spaces or special characters in the path. Quoting `${file}` yourself is unnecessary
(quotes in the template only group a token containing spaces, e.g. for the `-c`
argument below).

- macOS: `afplay ${file}`
- Linux: `paplay ${file}` (falls back to `aplay`)
- Windows: `powershell -NoProfile -c "(New-Object Media.SoundPlayer ${file}).PlaySync()"` (WAV only)

## Filtering by session type (entrypoint)

To play only for the extension (side panel) sessions and not for `claude` in the
integrated terminal, first measure the discriminator. Temporarily install this
hook, complete a response in both the extension side panel and the integrated
terminal `claude`, then diff the two blocks in `~/noroshi-env-debug.txt` to find
a variable that reliably differs (candidate: `CLAUDE_CODE_ENTRYPOINT`, which is
`claude-vscode` for the extension side panel).

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

Set the extension's value into `noroshi.entrypointFilter` (e.g. `["claude-vscode"]`).

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
