import { exec } from "node:child_process";

export interface CommandRunner {
  run(commandLine: string): Promise<void>;
}

/** シェル経由で再生コマンドを実行する。fire-and-forget だが失敗は reject する。 */
export class ExecCommandRunner implements CommandRunner {
  run(commandLine: string): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(commandLine, (err) => (err ? reject(err) : resolve()));
    });
  }
}
