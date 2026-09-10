# Noroshi の開発

Noroshi 本体をいじるためのメモです。利用者向けのセットアップは [README.ja.md](README.ja.md) を参照してください。

English version: [CONTRIBUTING.md](CONTRIBUTING.md)

## F5 でデバッグ実行（最速・ローカル）

1. このフォルダ（`noroshi`）を VSCode で開く。
2. 未実行なら `npm install`。
3. **F5**（実行 → デバッグ開始）を押すと、Noroshi を読み込んだ **Extension Development Host** ウィンドウが開く（`preLaunchTask` で自動コンパイル）。
4. そのウィンドウで適当なフォルダ（できれば `.claude/` があるもの）を開く。

音の最短テスト（Claude 不要。イベントファイルに 1 行入れば発火する）:

```sh
mkdir -p .claude
echo '{"event":"stop"}' >> .claude/noroshi-events.jsonl        # 完了音
echo '{"event":"notification"}' >> .claude/noroshi-events.jsonl # 待機音
```

注: 拡張は**起動時に既存イベントを破棄する**ので、**起動後に**追記すること。イベントファイルは読み取り直後に drain（削除）されるため、平常時は存在しないのが正常。ログは「出力」パネルの **Noroshi** チャンネルに出る。

## VSIX のビルドとインストール

```sh
npx @vscode/vsce package        # noroshi-X.Y.Z.vsix を生成（警告は無視でOK）
code --install-extension noroshi-X.Y.Z.vsix
```

または拡張パネル → `…` → **Install from VSIX**。Noroshi は `["ui"]` 拡張なのでローカル（UI）側に入る（Remote Container 用途で狙いどおり）。

## スクリプト

```sh
npm test              # 単体テスト（vitest）
npm run compile       # tsc ビルド（out/）
npm run lint          # oxlint
npm run format        # oxfmt
npm run test:integration  # 統合テスト（実 VSCode を起動。CI では xvfb-run が必要）
```

## entrypoint の判別子を実測する

Noroshi は `noroshi.entrypointFilter` で特定のセッション種別だけ鳴らせる（拡張のサイドパネルは `claude-vscode` を報告する。README の *応用* を参照）。この既知の値が合わなくなった場合は、自分で実測する。

一時的に以下のフックを仕込み、拡張版サイドパネルと統合ターミナルの `claude` の両方で応答を完了させ、`~/noroshi-env-debug.txt` の 2 ブロックを diff して、安定して異なる変数（候補 `CLAUDE_CODE_ENTRYPOINT`）を探す:

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

見つけた値を `noroshi.entrypointFilter` に設定する（例 `["claude-vscode"]`）。

## 手動スモークテスト（Remote Container）

1. Remote Container でフォルダを開く。
2. フックを設定する（README を参照）。
3. Claude Code に何か応答させ、`Stop` で完了音が手元で鳴ることを確認する。
4. `createFileSystemWatcher` が効かない環境でも、`pollInterval` 経過後に鳴ればポーリングの安全網が機能している。

## リリース手順

リリースは手動。

1. 出したいものが揃った `main` から始める。作業ツリーはクリーンで、CI はグリーンであること。

2. CHANGELOG を締める。`## [Unreleased]` の見出しを `## [X.Y.Z] - YYYY-MM-DD` に変え、ファイル末尾に対応するリンクを追加する:

   ```
   [X.Y.Z]: https://github.com/mtgto/noroshi/releases/tag/vX.Y.Z
   ```

3. バージョンを上げる:

   ```sh
   npm version X.Y.Z --no-git-tag-version
   ```

4. コミット・タグ・push:

   ```sh
   git commit -am "chore: release vX.Y.Z"
   git tag vX.Y.Z
   git push origin main --follow-tags
   ```

5. VSIX をビルドする:

   ```sh
   npm run package        # noroshi-X.Y.Z.vsix を生成
   ```

   前回のリリースから `.vscodeignore` を変えた場合は、`npx @vscode/vsce ls` で実際に何が入ったかを確認する。

6. Marketplace に公開する:

   ```sh
   npm run publish
   ```

   Marketplace の **Manage** スコープを持つ Azure DevOps の personal access token が必要。`npx @vscode/vsce login mtgto` で一度登録しておくか、`VSCE_PAT` 環境変数でその場だけ渡す。

7. GitHub リリースを作る。VSIX を添付し、2 で書いた CHANGELOG の該当セクションをリリースノートにする:

   ```sh
   gh release create vX.Y.Z --title vX.Y.Z --notes-file <notes.md> noroshi-X.Y.Z.vsix
   ```
