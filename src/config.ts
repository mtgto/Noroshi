export interface NoroshiSettings {
  enabled: boolean;
  eventsFile: string;
  soundNotification: string;
  soundStop: string;
  playerCommand: string;
  pollInterval: number;
  debounceMs: number;
  entrypointFilter: string[];
  statusBarShow: boolean;
}

// ${file} is substituted with a shell-quoted path (see shellQuote), so templates
// must NOT wrap ${file} in their own quotes.
const WINDOWS_PLAYER =
  'powershell -NoProfile -c "(New-Object Media.SoundPlayer ${file}).PlaySync()"';

/** Return the OS default when the setting is empty. Fall back to paplay for unknown platforms. */
export function resolvePlayerCommand(setting: string, platform: NodeJS.Platform): string {
  if (setting && setting.trim()) return setting;
  switch (platform) {
    case "darwin":
      return "afplay ${file}";
    case "win32":
      return WINDOWS_PLAYER;
    default:
      return "paplay ${file}";
  }
}

/** Replace every ${file} in the template with the given (already shell-quoted) value. */
export function buildPlayCommand(template: string, value: string): string {
  return template.split("${file}").join(value);
}

/**
 * Quote a path so it survives the shell as a single literal argument, preventing
 * injection via paths containing spaces or metacharacters.
 * - Windows uses PowerShell single-quoted strings (doubling embedded single quotes).
 * - POSIX uses single quotes with the standard '\'' escape for embedded quotes.
 */
export function shellQuote(path: string, platform: NodeJS.Platform): string {
  if (platform === "win32") {
    return "'" + path.replace(/'/g, "''") + "'";
  }
  return "'" + path.replace(/'/g, `'\\''`) + "'";
}

/** Negative or non-finite values fall back; 0 or positive pass through. */
export function clampNonNegative(n: number, fallback: number): number {
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
