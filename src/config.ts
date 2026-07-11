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

/** 設定が空なら OS 既定を返す。未知 OS は最も無難な paplay に寄せる。 */
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

/** テンプレの ${file} を実パスに置換する。 */
export function buildPlayCommand(template: string, filePath: string): string {
  return template.split("${file}").join(filePath);
}

/** 負値・非数は fallback、0 以上はそのまま。 */
export function clampNonNegative(n: number, fallback: number): number {
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
