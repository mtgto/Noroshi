import { spawn } from "node:child_process";

export interface CommandRunner {
  run(command: string, args: string[]): Promise<void>;
}

/**
 * Run the playback command directly (no shell in between), so a file path or
 * custom playerCommand containing shell metacharacters can't be interpreted.
 */
export class SpawnCommandRunner implements CommandRunner {
  run(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { shell: false });
      child.once("error", reject);
      child.once("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${command} exited with code ${code}`));
      });
    });
  }
}
