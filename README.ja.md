# Noroshi

Dev Container (ローカルの Docker コンテナ、または Kubernetes Pod) 上で動く Claude Code (VSCode 拡張版) の「応答待ち」「処理完了」を、手元 (ローカル) の効果音で通知する VSCode 拡張。

English version: [README.md](README.md)

## 仕組み

Claude Code のフックが Pod 上のイベントファイル (`.claude/noroshi-events.jsonl`) に 1 行追記し、
Noroshi (ローカル実行の UI 拡張) が `vscode.workspace.fs` でそれを監視して手元で音を鳴らす。

拡張は `extensionKind: ["ui"]` として**手元のマシンで動作**するため、`afplay` 等のローカル再生コマンドで
音を鳴らせる。監視対象ファイルはリモート (Pod) 側にあるが、ワークスペースのファイルシステム経由で読める。

## セットアップ

### 1. フックを設定する (手動)

`.claude/settings.json` に以下を追加する (Noroshi は settings.json を自動編集しない)。

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

どちらのフックもターミナル CLI では正常に発火する。VSCode 拡張では
`Notification` は現状一切発火しない — これは拡張の
`processControlRequest()` が `Notification` / `PermissionRequest` の
control-request サブタイプに対応するハンドラを持たなかったために起きていた
既知の上流バグ(根本原因の解析は
[anthropics/claude-code#8985 のコメント](https://github.com/anthropics/claude-code/issues/8985#issuecomment-3798023834)、
最初の報告は
[#16114](https://github.com/anthropics/claude-code/issues/16114) を参照)。
一方 `PermissionRequest` は**その後修正されており**、Write/Edit/Bash 系の
ツール実行許可ダイアログでも `AskUserQuestion` の選択ダイアログでも、拡張上
(Claude Code 2.1.207 で確認)で発火することを実機検証済み。現状 Noroshi が
拡張で音を鳴らせているのはこの `PermissionRequest` のおかげ。`Notification`
も無害なのでスニペットには残しており、`idle_prompt` などターミナル CLI 側の
ユースケースはこちらでしか拾えない。

既知の未対応ケースが1つある: サンドボックスの「ネットワーク接続を許可しますか?」
ダイアログ(`curl` 実行時などに出る)は、表示時にも選択後にもどちらのフックも
発火しない。これは別の未対応コードパスらしく、現状 Noroshi 側で拾う手段がない。

`noroshi.eventsFile` を変えた場合は追記先パスも合わせること。

### 2. ステータスバー

`🔊 Noroshi` が出れば設定検出済み。`⚠️ Noroshi` はフック未設定。クリック
(またはコマンドパレットから **Noroshi: メニューを表示**) するとメニューが開き、
「フックスニペットをクリップボードにコピー (現在の `noroshi.eventsFile` を反映済み)」
「セットアップ手順を開く」「有効/無効切り替え」「出力ログを表示」「設定を開く」
を選べる。

## 設定

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

`eventsFile` / `playerCommand` / `sounds.*` はローカルコマンドの実行やローカルファイルの操作に繋がるため、
[VSCode Workspace Trust](https://code.visualstudio.com/docs/editor/workspace-trust) の対象になっている。
信頼されていないワークスペースでは、これらのワークスペース/フォルダ単位の上書き設定は無視され、ユーザー設定
またはデフォルト値にフォールバックする (Noroshi 自体はそのデフォルト値で通常通り動作を続ける)。

### 音声フォーマット

同梱デフォルトは WAV (全 OS の既定コマンドが再生できる最小公倍数)。
`sounds.*` に任意フォーマットのパスを指定可 (再生可否は `playerCommand` 依存)。
macOS は afplay が mp3/m4a も再生する。mp3/m4a を既定にしたい場合は `playerCommand` を
`ffplay -nodisp -autoexit ${file}` 等に。

### OS 別の既定再生コマンド

`playerCommand` は argv トークンに分割してそのまま実行される (**シェルを経由しない**) ため、`${file}` は
パスにスペースや特殊文字が含まれていても 1 つのリテラル引数として渡される。`${file}` を自分で引用符で
囲む必要はない (テンプレート内の引用符は、下記の `-c` 引数のようにスペースを含むトークンをまとめるためだけに使われる)。

- macOS: `afplay ${file}`
- Linux: `paplay ${file}` (無ければ `aplay`)
- Windows: `powershell -NoProfile -c "(New-Object Media.SoundPlayer ${file}).PlaySync()"` (WAV のみ)

## セッション種別で鳴らし分ける (entrypoint)

拡張版セッションだけ鳴らしたい場合、まず判別子を実測する。
一時的に以下のフックを仕込み、拡張版サイドパネルと統合ターミナルの `claude` の両方で応答を完了させ、
`~/noroshi-env-debug.txt` の 2 ブロックを diff して安定して異なる変数 (候補 `CLAUDE_CODE_ENTRYPOINT`) の値を確認する。

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

確認した拡張版の値を `noroshi.entrypointFilter` に設定する (拡張のサイドパネルは `claude-vscode`。例 `["claude-vscode"]`)。

## 手動スモーク (Remote Container)

1. Remote Container でフォルダを開く。
2. 上記フックを設定。
3. Claude Code に何か応答させ、`Stop` で完了音が鳴ることを確認。
4. `createFileSystemWatcher` が効かない環境でも、`pollInterval` 経過後に鳴ればポーリング従が機能している。

## ローカル開発

### F5 でデバッグ実行 (最速・ローカル)

1. このフォルダ (`noroshi`) を VSCode で開く。
2. 未実行なら `npm install`。
3. **F5** (実行 → デバッグ開始) → Noroshi を読み込んだ **Extension Development Host** ウィンドウが開く (`preLaunchTask` で自動コンパイル)。
4. そのウィンドウで適当なフォルダ (できれば `.claude/` があるもの) を開く。

音の最短テスト (Claude 不要。イベントファイルに1行入れば発火):

```sh
mkdir -p .claude
echo '{"event":"stop"}' >> .claude/noroshi-events.jsonl        # 完了音
echo '{"event":"notification"}' >> .claude/noroshi-events.jsonl # 待機音
```

注: 拡張は**起動時に既存イベントを破棄**するので、**起動後に**追記すること。イベントファイルは読み取り直後に drain (削除) されるため、平常時は存在しないのが正常。ログは「出力」パネルの **Noroshi** チャンネル。

### VSCode にインストール (VSIX)

```sh
npx @vscode/vsce package        # noroshi-0.0.1.vsix を生成 (警告は無視でOK)
code --install-extension noroshi-0.0.1.vsix
```

または拡張パネル → `…` → **Install from VSIX**。Noroshi は `["ui"]` 拡張なのでローカル (UI) 側に入る (Remote Container 用途で狙いどおり)。

### スクリプト

```sh
npm test              # 単体テスト (vitest)
npm run compile       # tsc ビルド (out/)
npm run lint          # oxlint
npm run format        # oxfmt
npm run test:integration  # 統合テスト (実 VSCode を起動。CI では xvfb-run が必要)
npm run gen-sounds    # 同梱 WAV を再生成
```
