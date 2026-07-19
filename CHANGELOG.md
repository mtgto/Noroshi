# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.0]: https://github.com/mtgto/noroshi/releases/tag/v0.1.0
