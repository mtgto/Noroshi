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

const WINDOWS_PLAYER =
  `powershell -NoProfile -c "(New-Object Media.SoundPlayer '` + "${file}" + `').PlaySync()"`;

/** Return the OS default when the setting is empty. Fall back to paplay for unknown platforms. */
export function resolvePlayerCommand(setting: string, platform: NodeJS.Platform): string {
  if (setting && setting.trim()) return setting;
  switch (platform) {
    case "darwin":
      return 'afplay "${file}"';
    case "win32":
      return WINDOWS_PLAYER;
    default:
      return 'paplay "${file}"';
  }
}

/** Replace ${file} in the template with the actual path. */
export function buildPlayCommand(template: string, filePath: string): string {
  return template.split("${file}").join(filePath);
}

/** Negative or non-finite values fall back; 0 or positive pass through. */
export function clampNonNegative(n: number, fallback: number): number {
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
