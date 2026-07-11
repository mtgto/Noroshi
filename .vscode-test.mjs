import { defineConfig } from "@vscode/test-cli";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";

const ws = fs.mkdtempSync(path.join(os.tmpdir(), "noroshi-ws-"));

export default defineConfig({
  files: "out/test/integration/**/*.test.js",
  version: "stable",
  workspaceFolder: ws,
  mocha: { timeout: 20000 },
});
