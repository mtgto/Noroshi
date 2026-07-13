# Suppress Sound When Focused Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in `noroshi.suppressWhenFocused` setting that skips playing a sound for `notification`/`stop` events while the VSCode window running Noroshi is focused.

**Architecture:** `Player` (src/player.ts) is a pure, vscode-independent class that receives its collaborators (clock, runner, sound resolver, etc.) via `PlayerOptions`, which is what makes it unit-testable without a VSCode host. This feature follows the same pattern: add `suppressWhenFocused: boolean` and `isFocused: () => boolean` to `PlayerOptions`, check them early in `Player.handle()`, and wire `extension.ts` to read the new setting and pass `() => vscode.window.state.focused` as `isFocused`.

**Tech Stack:** TypeScript, VSCode Extension API, vitest.

## Global Constraints

- Setting name: `noroshi.suppressWhenFocused`, type `boolean`, default `false`.
- Applies to both `notification` and `stop` events together (no per-event granularity in this iteration).
- Suppressed events must not update the debounce map (`lastPlayed`) — see spec's "Player.handle() change" section.
- Comments in code and commit messages: English. (Repo convention, per CLAUDE.md.)
- Spec: `docs/superpowers/specs/2026-07-13-suppress-when-focused-design.md`

---

### Task 1: `Player` accepts `isFocused` and `suppressWhenFocused`, suppresses playback when focused

**Files:**
- Modify: `src/player.ts`
- Test: `src/test/unit/player.test.ts`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `PlayerOptions` gains two fields consumed by Task 2 (`extension.ts` wiring):
  - `suppressWhenFocused: boolean`
  - `isFocused: () => boolean`

- [ ] **Step 1: Write the failing tests**

Add these test cases to `src/test/unit/player.test.ts`. First, update the `make()` helper to accept the two new optional fields and supply defaults that preserve today's behavior (`suppressWhenFocused: false`, `isFocused` always returning `false`):

```ts
function make(
  opts: Partial<{
    debounceMs: number;
    entrypointFilter: string[];
    suppressWhenFocused: boolean;
    isFocused: () => boolean;
  }> = {},
) {
  const runner = new FakeCommandRunner();
  const clock = new FakeClock(1000);
  const sounds: Record<string, string> = { notification: "/s/wait.wav", stop: "/s/done.wav" };
  const logs: string[] = [];
  const player = new Player({
    runner,
    clock,
    playerCommand: ["afplay", "${file}"],
    soundFor: (k) => sounds[k] ?? null,
    debounceMs: opts.debounceMs ?? 250,
    entrypointFilter: opts.entrypointFilter ?? [],
    suppressWhenFocused: opts.suppressWhenFocused ?? false,
    isFocused: opts.isFocused ?? (() => false),
    log: (m) => logs.push(m),
  });
  return { runner, clock, player, logs };
}
```

Then add a new `describe` block at the end of the file (before the closing of the file, as a sibling to the existing `describe("Player.handle", ...)`):

```ts
describe("Player.handle suppressWhenFocused", () => {
  it("does not play when suppressWhenFocused is true and the window is focused", () => {
    const { runner, player } = make({ suppressWhenFocused: true, isFocused: () => true });
    player.handle({ event: "stop" });
    expect(runner.calls).toEqual([]);
  });

  it("plays when suppressWhenFocused is true but the window is not focused", () => {
    const { runner, player } = make({ suppressWhenFocused: true, isFocused: () => false });
    player.handle({ event: "stop" });
    expect(runner.calls.length).toBe(1);
  });

  it("plays when suppressWhenFocused is false even if the window is focused", () => {
    const { runner, player } = make({ suppressWhenFocused: false, isFocused: () => true });
    player.handle({ event: "stop" });
    expect(runner.calls.length).toBe(1);
  });

  it("logs when suppressing due to focus", () => {
    const { player, logs } = make({ suppressWhenFocused: true, isFocused: () => true });
    player.handle({ event: "notification" });
    expect(logs.some((l) => /focused/.test(l) && /notification/.test(l))).toBe(true);
  });

  it("does not consume the debounce window when suppressed by focus", () => {
    // Suppressed while focused, then unfocuses -> the same event must still play,
    // proving suppression didn't update lastPlayed and trip the debounce check.
    let focused = true;
    const { runner, player } = make({
      suppressWhenFocused: true,
      isFocused: () => focused,
      debounceMs: 250,
    });
    player.handle({ event: "stop" }); // suppressed (focused)
    focused = false;
    player.handle({ event: "stop" }); // should play (not blocked by debounce)
    expect(runner.calls.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- player.test.ts`
Expected: FAIL — `PlayerOptions` has no properties `suppressWhenFocused`/`isFocused` (TypeScript compile error surfaced by vitest), or if it compiles loosely, the new assertions fail because nothing suppresses playback yet.

- [ ] **Step 3: Implement the minimal change**

In `src/player.ts`, update `PlayerOptions` and `handle()`:

```ts
export interface PlayerOptions {
  runner: CommandRunner;
  clock: Clock;
  playerCommand: string[];
  soundFor: SoundResolver;
  debounceMs: number;
  entrypointFilter: string[];
  suppressWhenFocused: boolean;
  isFocused: () => boolean;
  log: (msg: string) => void;
}
```

```ts
  handle(e: RawEvent): void {
    const { entrypointFilter, soundFor, clock, debounceMs, log } = this.opts;

    if (entrypointFilter.length > 0) {
      if (!e.entrypoint || !entrypointFilter.includes(e.entrypoint)) return;
    }

    if (this.opts.suppressWhenFocused && this.opts.isFocused()) {
      log(`skip event because window is focused: ${e.event}`);
      return;
    }

    const file = soundFor(e.event);
    if (!file) {
      log(`skip event without sound mapping: ${e.event}`);
      return;
    }

    const now = clock.now();
    const last = this.lastPlayed.get(e.event);
    if (last !== undefined && now - last < debounceMs) return;
    this.lastPlayed.set(e.event, now);

    const [command, ...args] = buildPlayCommand(this.opts.playerCommand, file);
    this.opts.runner.run(command, args).catch((err) => this.logError(err));
  }
```

(Only the two new interface fields and the new `if` block are additions; the rest of `handle()` is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- player.test.ts`
Expected: PASS, all tests in the file including the 5 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/player.ts src/test/unit/player.test.ts
git commit -m "$(cat <<'EOF'
feat: let Player suppress playback while the window is focused

Player.handle() now skips playing when suppressWhenFocused is true and
isFocused() returns true, without touching the debounce map so an
unfocus right after a suppressed event doesn't swallow the next one.
EOF
)"
```

---

### Task 2: Wire the `noroshi.suppressWhenFocused` setting into `extension.ts`

**Files:**
- Modify: `src/config.ts`
- Modify: `src/extension.ts`

**Interfaces:**
- Consumes: `PlayerOptions.suppressWhenFocused` / `PlayerOptions.isFocused` from Task 1.
- Produces: `NoroshiSettings.suppressWhenFocused: boolean`, read by nothing else in this plan (terminal wiring point).

- [ ] **Step 1: Add the field to `NoroshiSettings`**

In `src/config.ts`, add to the `NoroshiSettings` interface (after `entrypointFilter`):

```ts
export interface NoroshiSettings {
  enabled: boolean;
  eventsFile: string;
  soundNotification: string;
  soundStop: string;
  playerCommand: string[];
  pollInterval: number;
  debounceMs: number;
  entrypointFilter: string[];
  suppressWhenFocused: boolean;
  statusBarShow: boolean;
}
```

There is no parsing/validation helper needed for a plain boolean (unlike `resolvePlayerCommand` or `clampNonNegative`), so no other change is needed in `config.ts`.

- [ ] **Step 2: Verify the config test file still passes (no new cases needed here)**

Run: `npm test -- config.test.ts`
Expected: PASS (the interface change alone doesn't affect any tested function; this step is a sanity check, not a TDD red step).

- [ ] **Step 3: Read the setting and pass it to `Player` in `extension.ts`**

In `src/extension.ts`, `readSettings()` (around line 73-87), add the new field:

```ts
function readSettings(): NoroshiSettings {
  const c = vscode.workspace.getConfiguration("noroshi");
  const platform = process.platform;
  return {
    enabled: c.get("enabled", true),
    eventsFile: c.get("eventsFile", ".claude/noroshi-events.jsonl"),
    soundNotification: c.get("sounds.notification", ""),
    soundStop: c.get("sounds.stop", ""),
    playerCommand: resolvePlayerCommand(c.get("playerCommand", ""), platform),
    pollInterval: clampNonNegative(c.get("pollInterval", 3000), 3000),
    debounceMs: clampNonNegative(c.get("debounceMs", 250), 250),
    entrypointFilter: c.get("entrypointFilter", []),
    suppressWhenFocused: c.get("suppressWhenFocused", false),
    statusBarShow: c.get("statusBar.show", true),
  };
}
```

Then, in `start()`, where `Player` is constructed (around line 137-145), add the two new options:

```ts
  const player = new Player({
    runner: new SpawnCommandRunner(),
    clock: new RealClock(),
    playerCommand: s.playerCommand,
    soundFor,
    debounceMs: s.debounceMs,
    entrypointFilter: s.entrypointFilter,
    suppressWhenFocused: s.suppressWhenFocused,
    isFocused: () => vscode.window.state.focused,
    log: (m) => output.appendLine(m),
  });
```

- [ ] **Step 4: Compile to catch type errors**

Run: `npm run compile`
Expected: succeeds with no TypeScript errors (this confirms `PlayerOptions` is fully satisfied and `NoroshiSettings` is consistent).

- [ ] **Step 5: Run the full unit test suite**

Run: `npm test`
Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/extension.ts
git commit -m "$(cat <<'EOF'
feat: read noroshi.suppressWhenFocused and wire it into Player

Defaults to false (unchanged behavior). When true, Player.isFocused
is backed by vscode.window.state.focused, which reflects only this
window instance's focus state.
EOF
)"
```

---

### Task 3: Register the setting in `package.json` and add NLS descriptions

**Files:**
- Modify: `package.json`
- Modify: `package.nls.json`
- Modify: `package.nls.ja.json`

**Interfaces:**
- Consumes: nothing (config schema only; `extension.ts` in Task 2 already reads `noroshi.suppressWhenFocused` via `c.get(...)`, which works regardless of schema registration, but the schema is required for the setting to appear in the Settings UI and for defaults/validation).
- Produces: nothing consumed by other tasks; this is the final piece needed for the setting to be user-facing.

- [ ] **Step 1: Add the property to `package.json`**

In `package.json`, `contributes.configuration.properties`, add a new entry after `noroshi.entrypointFilter` (currently ending at line 90) and before `noroshi.statusBar.show` (currently starting at line 91):

```json
        "noroshi.entrypointFilter": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "default": [],
          "description": "%config.entrypointFilter.description%"
        },
        "noroshi.suppressWhenFocused": {
          "type": "boolean",
          "default": false,
          "description": "%config.suppressWhenFocused.description%"
        },
        "noroshi.statusBar.show": {
          "type": "boolean",
          "default": true,
          "description": "%config.statusBar.show.description%"
        }
```

(Only the new `noroshi.suppressWhenFocused` block is added; `entrypointFilter` and `statusBar.show` are shown for placement context and are otherwise unchanged.)

- [ ] **Step 2: Add the English description**

In `package.nls.json`, add a new key after `config.entrypointFilter.description`:

```json
  "config.entrypointFilter.description": "Filter playback by the event entrypoint discriminator. Empty plays everything. Example: [\"claude-vscode\"] plays only VSCode extension sessions.",
  "config.suppressWhenFocused.description": "Do not play a sound while this VSCode window is focused.",
  "config.statusBar.show.description": "Show the Noroshi status in the status bar."
```

- [ ] **Step 3: Add the Japanese description**

In `package.nls.ja.json`, add a new key after `config.entrypointFilter.description`:

```json
  "config.entrypointFilter.description": "イベントの entrypoint 判別子で再生をフィルタする。空ならすべて鳴らす。例: [\"claude-vscode\"] で VSCode 拡張版セッションのみ再生。",
  "config.suppressWhenFocused.description": "この VSCode ウィンドウがフォーカスされている間は音を鳴らさない。",
  "config.statusBar.show.description": "ステータスバーに Noroshi の状態を表示する。"
```

- [ ] **Step 4: Verify JSON validity**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8')); JSON.parse(require('fs').readFileSync('package.nls.json', 'utf8')); JSON.parse(require('fs').readFileSync('package.nls.ja.json', 'utf8')); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 5: Run `npm run lint`**

Run: `npm run lint`
Expected: passes (no oxlint errors introduced).

- [ ] **Step 6: Commit**

```bash
git add package.json package.nls.json package.nls.ja.json
git commit -m "$(cat <<'EOF'
feat: register noroshi.suppressWhenFocused in the settings schema

Adds the English and Japanese descriptions so the setting is
discoverable in the VSCode Settings UI.
EOF
)"
```

---

### Task 4: Update README documentation

**Files:**
- Modify: `README.md`
- Modify: `README.ja.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (documentation only).

- [ ] **Step 1: Add a row to the settings table in `README.md`**

In `README.md`, the settings table (lines 97-106), add a new row after the `entrypointFilter` row:

```markdown
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
```

- [ ] **Step 2: Add a row to the settings table in `README.ja.md`**

In `README.ja.md`, the settings table (lines 89-98), add a new row after the `entrypointFilter` row:

```markdown
| 設定 | 既定 | 説明 |
|---|---|---|
| `noroshi.enabled` | `true` | 有効/無効 |
| `noroshi.eventsFile` | `.claude/noroshi-events.jsonl` | 監視ファイル (相対=ワークスペース基準 / 絶対=Pod 絶対パス) |
| `noroshi.sounds.notification` / `.stop` | `""` | 音声上書き (空=同梱 WAV) |
| `noroshi.playerCommand` | `""` | 再生コマンド。`${file}` 置換。空=OS 既定 |
| `noroshi.pollInterval` | `3000` | 安全網ポーリング (ms)。0 で無効 |
| `noroshi.debounceMs` | `250` | 同種連打の抑制窓 (ms) |
| `noroshi.entrypointFilter` | `[]` | 例 `["claude-vscode"]` で拡張版セッションのみ再生 |
| `noroshi.suppressWhenFocused` | `false` | この VSCode ウィンドウがフォーカスされている間は音を鳴らさない |
| `noroshi.statusBar.show` | `true` | ステータスバー表示 |
```

- [ ] **Step 3: Commit**

```bash
git add README.md README.ja.md
git commit -m "$(cat <<'EOF'
docs: document the noroshi.suppressWhenFocused setting
EOF
)"
```

---

### Task 5: Full verification pass

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full unit test suite**

Run: `npm test`
Expected: PASS, all tests including the 5 new ones from Task 1.

- [ ] **Step 2: Compile**

Run: `npm run compile`
Expected: succeeds with no errors.

- [ ] **Step 3: Lint and format check**

Run: `npm run lint && npm run format`
Expected: both succeed with no errors.

- [ ] **Step 4: Manual smoke test (per README's existing F5 workflow)**

1. Press F5 in VSCode to launch the Extension Development Host.
2. In the host window, open a folder with a `.claude/` directory.
3. Open VSCode Settings (`Cmd+,`), search `noroshi.suppressWhenFocused`, set it to `true`.
4. With the Extension Development Host window focused, append a test event:
   ```sh
   mkdir -p .claude
   echo '{"event":"stop"}' >> .claude/noroshi-events.jsonl
   ```
5. Expected: no sound plays, and the Noroshi output channel logs a line matching `skip event because window is focused: stop`.
6. Switch focus away from the Extension Development Host window (e.g. click the main VSCode window or another app), then append another event:
   ```sh
   echo '{"event":"stop"}' >> .claude/noroshi-events.jsonl
   ```
7. Expected: the sound plays (confirms suppression only applies while focused).
8. Set `noroshi.suppressWhenFocused` back to `false` (or remove the override) and confirm sounds play regardless of focus (regression check).
