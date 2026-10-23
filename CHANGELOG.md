# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Pass `NOROSHI_EVENT`, `NOROSHI_WORKSPACE_NAME`, and `NOROSHI_WORKSPACE_URI`
  to `playerCommand` as environment variables, so it can show a desktop
  notification that brings the right VSCode window to the front on click. The
  README has a macOS example using terminal-notifier.
- README: an example that reads the workspace name aloud with `say`.

## [0.2.0] - 2026-09-10

### Changed

- Install only the `Notification` hook; `PermissionRequest` is no longer
  installed. Claude Code 2.1.233 fixed `Notification` not firing for permission
  prompts in the VSCode extension, so hooking both now plays the sound twice for
  one dialog (measured ~6s apart on 2.1.266, well beyond `debounceMs`). Using the
  VSCode extension with Claude Code older than 2.1.233 now needs Noroshi v0.1.0.

### Fixed

- Documented that the sandbox's "Allow network connection to this host?" dialog
  does reach Noroshi on 2.1.266 — the previous README said no hook fired for it.
- Documented that leaving the VSCode extension idle still plays no sound: the
  `idle_prompt` notification fires only in the terminal CLI.

### Removed

- Dropped `PermissionRequest` from the hand-written hook snippet in the README.
  Upgrading from v0.1.0 leaves the old entry behind (Noroshi never deletes hook
  entries), so it must be removed by hand to stop the duplicate sound.

## [0.1.0] - 2026-07-19

Initial release.

- Core extension: watch a remote events file and play a local sound when
  Claude Code is waiting for input or has finished.
- Play sounds even when Claude Code runs in a Dev Container / Kubernetes Pod
  (events relayed through `.claude/noroshi-events.jsonl`, played on the host via
  `extensionKind: ["ui"]`).
- **Noroshi: Install Claude Code Hooks** command to add the required hooks to
  `.claude/settings.json` / `settings.local.json` automatically.
- `noroshi.suppressWhenFocused` setting to stay silent while the window is
  focused.
- Status bar item with a QuickPick menu.
- Open the extension's Details page from the menu.
- Recorded notification chimes as the default sounds.
- Localized settings and UI strings in Japanese (via `vscode.l10n` and
  `package.nls`).

[Unreleased]: https://github.com/mtgto/noroshi/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/mtgto/noroshi/releases/tag/v0.2.0
[0.1.0]: https://github.com/mtgto/noroshi/releases/tag/v0.1.0
