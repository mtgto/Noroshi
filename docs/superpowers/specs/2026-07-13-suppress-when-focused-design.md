# Suppress sound when the VSCode window is focused

## Background

Noroshi plays a local sound whenever a Claude Code hook (`notification` /
`stop`) fires. Some users want the sound suppressed while they are actively
looking at the VSCode window running the Claude Code session — if you're
already watching the screen, an audible alert is redundant. By default,
Noroshi should keep playing regardless of focus (current behavior); this is
an opt-in setting for users who want the quieter behavior.

## Setting

`noroshi.suppressWhenFocused` (boolean, default `false`)

When `true`, Noroshi does not play a sound for `notification` or `stop`
events while this VSCode window is focused (frontmost). When `false`
(default), behavior is unchanged from today.

This applies to both event kinds together; there is no per-event toggle in
this iteration. (Considered a `string[]` of event kinds for future per-event
control, but the user preferred a single boolean for simplicity. Revisit if
a per-event need arises later — the internal check is isolated enough in
`Player.handle()` that swapping the boolean for an array later is a small,
localized change.)

## Focus detection

`vscode.window.state.focused` reports whether *this* window instance
(i.e., the window Noroshi's UI extension is running in) is the frontmost
window. This is exactly the granularity wanted: if the user has multiple
VSCode windows open across different projects and is looking at a
*different* window, `state.focused` for this window is `false` and the
sound still plays — matching the intuitive "am I looking at this project"
semantics.

No event subscription (`vscode.window.onDidChangeWindowState`) is needed;
Noroshi only needs to read the focus state at the moment an event is
handled, not react to focus changes as standalone events.

## Wiring

`player.ts`'s `Player` class has no dependency on the `vscode` module today
— it receives collaborators like `clock` and `runner` through
`PlayerOptions`, which keeps it unit-testable without a VSCode host. Follow
the same pattern:

- Add `isFocused: () => boolean` and `suppressWhenFocused: boolean` to
  `PlayerOptions` (`src/player.ts`).
- In `src/extension.ts`, `readSettings()` reads
  `noroshi.suppressWhenFocused` (default `false`) into `NoroshiSettings`.
  When constructing `Player` in `start()`, pass
  `isFocused: () => vscode.window.state.focused`.

## `Player.handle()` change

Insert the focus-suppression check right after the existing
`entrypointFilter` check and before `soundFor(e.event)` is called (no need
to resolve a sound file for an event that will be suppressed):

```ts
if (this.opts.suppressWhenFocused && this.opts.isFocused()) {
  log(`skip event because window is focused: ${e.event}`);
  return;
}
```

Suppressed events must **not** update `lastPlayed` (the debounce map). If
they did, unfocusing right after a suppressed event could cause the *next*
occurrence of the same event to be swallowed by the debounce window even
though nothing was actually played. Returning before the `lastPlayed.set`
call (as in the current code path for unmapped events) avoids this.

## Tests

`src/test/unit/player.test.ts`: add cases using a fake `isFocused`:

- `suppressWhenFocused: true` + `isFocused()` returning `true` → command is
  not run.
- `suppressWhenFocused: true` + `isFocused()` returning `false` → command
  runs normally.
- `suppressWhenFocused: false` (regardless of `isFocused()`) → command runs
  normally (regression check for the default).
- A suppressed event followed shortly by the same event with focus lost
  is not blocked by debounce (verifies `lastPlayed` isn't touched on
  suppression).

`src/test/unit/config.test.ts`: no change needed — the setting is a plain
boolean read directly in `extension.ts`, no parsing helper involved.

## Docs / config schema

- `package.json`: add `noroshi.suppressWhenFocused` to
  `contributes.configuration.properties` (boolean, default `false`,
  `%config.suppressWhenFocused.description%`).
- `package.nls.json` / `package.nls.ja.json`: add the description string in
  English and Japanese.
- `README.md` / `README.ja.md`: add a row to the settings table.

## Out of scope

- Per-event granularity (see note above under Setting).
- Detecting focus of *other* VSCode windows or other applications —
  `vscode.window.state.focused` only ever reports this window's state,
  which is the desired behavior, not a limitation to work around.
