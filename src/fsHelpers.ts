import type { FileSystem } from "./fileSystem";

/** Reads a file, treating any read failure (absent or unreadable) as "not present". */
export async function readIfPresent(fs: FileSystem, id: string): Promise<string | null> {
  try {
    return await fs.readFile(id);
  } catch {
    return null;
  }
}
