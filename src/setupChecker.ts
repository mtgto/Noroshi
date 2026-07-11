import type { FileSystem } from "./fileSystem";

/** Returns true if any of the settings files contains the marker (read-only). */
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
      continue; // absent or unreadable
    }
    if (content.includes(marker)) return true;
  }
  return false;
}
