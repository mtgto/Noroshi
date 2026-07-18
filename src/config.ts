import * as path from "node:path";

export interface NoroshiSettings {
  enabled: boolean;
  eventsFile: string;
  soundNotification: string;
  soundStop: string;
  soundToolWait: string;
  playerCommand: string[];
  pollInterval: number;
  debounceMs: number;
  entrypointFilter: string[];
  suppressWhenFocused: boolean;
  toolWaitEnabled: boolean;
  toolWaitThresholdMs: number;
  statusBarShow: boolean;
}

// ${file} is substituted as a literal argv element (see buildPlayCommand) — the
// command runs without a shell, so no quoting is needed and none should be added.
//
// Windows has no built-in WAV player, so we fall back to PowerShell's SoundPlayer.
// The path is bound via a param() instead of being interpolated into the script
// text, so it can't break out of the script regardless of its contents.
const WINDOWS_PLAYER = [
  "powershell",
  "-NoProfile",
  "-Command",
  "& {param($f) (New-Object Media.SoundPlayer $f).PlaySync()}",
  "${file}",
];

/** Return the OS default (as argv) when the setting is empty. Fall back to paplay for unknown platforms. */
export function resolvePlayerCommand(setting: string, platform: NodeJS.Platform): string[] {
  if (setting && setting.trim()) return splitCommandLine(setting);
  switch (platform) {
    case "darwin":
      return ["afplay", "${file}"];
    case "win32":
      return WINDOWS_PLAYER;
    default:
      return ["paplay", "${file}"];
  }
}

/**
 * Split a command-line template into argv tokens for spawn(). Quotes (single or
 * double) only group a token containing spaces — there is no shell semantics
 * beyond that (no escaping, globbing, or expansion).
 */
export function splitCommandLine(s: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    let token = "";
    let quote: string | null = null;
    while (i < s.length) {
      const ch = s[i];
      if (quote) {
        if (ch === quote) quote = null;
        else token += ch;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        i++;
        continue;
      }
      if (/\s/.test(ch)) break;
      token += ch;
      i++;
    }
    tokens.push(token);
  }
  return tokens;
}

/** Replace every ${file} in the template's argv tokens with the given literal path. */
export function buildPlayCommand(template: string[], file: string): string[] {
  return template.map((token) => token.split("${file}").join(file));
}

/** Negative or non-finite values fall back; 0 or positive pass through. */
export function clampNonNegative(n: number, fallback: number): number {
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * True for POSIX or Windows (drive-letter or UNC) absolute paths, regardless of the
 * host platform — eventsFile may point at a path on a remote (Pod) that runs a
 * different OS than the machine running this extension.
 */
export function isAbsolutePath(p: string): boolean {
  return path.posix.isAbsolute(p) || path.win32.isAbsolute(p);
}
