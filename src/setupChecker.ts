import type { FileSystem } from "./fileSystem";

/** settings ファイル群のいずれかが marker を含めば true (read-only)。 */
export async function checkHooksConfigured(
  fs: FileSystem,
  settingsIds: string[],
  marker: string,
): Promise<boolean> {
  for (const id of settingsIds) {
    let content: string;
    try {
      content = await fs.readFile(id);
    } catch {
      continue; // 不在/読めない
    }
    if (content.includes(marker)) return true;
  }
  return false;
}
