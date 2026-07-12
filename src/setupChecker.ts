import type { FileSystem } from "./fileSystem";

/**
 * Returns true if any of the settings files contains needle (read-only). Passing
 * eventsFile as needle detects a hook that actually appends to the watched file,
 * whether or not it was copied verbatim from buildHookSnippet's generated command.
 */
export async function checkHooksConfigured(
  fs: FileSystem,
  settingsIds: string[],
  needle: string,
): Promise<boolean> {
  for (const id of settingsIds) {
    let content: string;
    try {
      content = await fs.readFile(id);
    } catch {
      continue; // absent or unreadable
    }
    if (content.includes(needle)) return true;
  }
  return false;
}
