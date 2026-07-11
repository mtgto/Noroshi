import { exec } from "node:child_process";

export interface CommandRunner {
  run(commandLine: string): Promise<void>;
}

/** Run the playback command through a shell. Fire-and-forget, but rejects on failure. */
export class ExecCommandRunner implements CommandRunner {
  run(commandLine: string): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(commandLine, (err) => (err ? reject(err) : resolve()));
    });
  }
}
