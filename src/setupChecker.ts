import type { FileSystem } from "./fileSystem";
import { readIfPresent } from "./fsHelpers";

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
    const content = await readIfPresent(fs, id);
    if (content?.includes(needle)) return true;
  }
  return false;
}
