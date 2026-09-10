# Contributing to Noroshi

Notes for hacking on Noroshi itself. For user-facing setup, see [README.md](README.md).

日本語版は [CONTRIBUTING.ja.md](CONTRIBUTING.ja.md) を参照してください。

## Run via F5 (fastest, local)

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

## Build and install a VSIX

```sh
npx @vscode/vsce package        # produces noroshi-X.Y.Z.vsix (warnings are OK)
code --install-extension noroshi-X.Y.Z.vsix
```

Or use the Extensions panel → `…` → **Install from VSIX**. Because Noroshi is a
`["ui"]` extension, it installs on the local (UI) side — which is what you want
for the Remote Container use case.

## Scripts

```sh
npm test              # unit tests (vitest)
npm run compile       # tsc build (out/)
npm run clean         # remove out/ (packaging and publishing do this for you)
npm run lint          # oxlint
npm run format        # oxfmt
npm run test:integration  # integration test (launches a real VSCode; CI needs xvfb-run)
```

## Measuring the entrypoint discriminator

Noroshi can play only for a specific session type via `noroshi.entrypointFilter`
(the extension side panel reports `claude-vscode`; see the README's *Advanced*
section). If that known value ever stops matching, measure it yourself.

Temporarily install this hook, complete a response in both the extension side
panel and the integrated terminal `claude`, then diff the two blocks in
`~/noroshi-env-debug.txt` to find a variable that reliably differs (candidate:
`CLAUDE_CODE_ENTRYPOINT`):

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

Set the discovered value into `noroshi.entrypointFilter` (e.g. `["claude-vscode"]`).

## Manual smoke test (Remote Container)

1. Open a folder inside the Remote Container.
2. Configure the hook (see the README).
3. Have Claude Code respond to something and confirm the `Stop` sound plays on
   your local machine.
4. Even where `createFileSystemWatcher` does not fire, a sound after `pollInterval`
   confirms the polling safety net is working.

## Releasing

Releasing is manual.

1. Start from a clean `main` that already has everything you want to ship, with CI
   green.

2. Close out the CHANGELOG. Rename the `## [Unreleased]` heading to
   `## [X.Y.Z] - YYYY-MM-DD` and add the matching link at the bottom of the file:

   ```
   [X.Y.Z]: https://github.com/mtgto/noroshi/releases/tag/vX.Y.Z
   ```

3. Bump the version:

   ```sh
   npm version X.Y.Z --no-git-tag-version
   ```

4. Commit, tag, and push:

   ```sh
   git commit -am "chore: release vX.Y.Z"
   git tag vX.Y.Z
   git push origin main --follow-tags
   ```

5. Build the VSIX:

   ```sh
   npm run package        # produces noroshi-X.Y.Z.vsix
   ```

   If `.vscodeignore` changed since the last release, confirm what actually went in
   with `npx @vscode/vsce ls`.

6. Publish to the Marketplace:

   ```sh
   npm run publish
   ```

   This needs an Azure DevOps personal access token with the Marketplace **Manage**
   scope. Either register it once with `npx @vscode/vsce login mtgto`, or pass it
   for the single command via the `VSCE_PAT` environment variable.

7. Create the GitHub release, attaching the VSIX and using the CHANGELOG section
   you just wrote as the notes:

   ```sh
   gh release create vX.Y.Z --title vX.Y.Z --notes-file <notes.md> noroshi-X.Y.Z.vsix
   ```
