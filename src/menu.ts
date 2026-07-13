import { isAbsolutePath } from "./config";

export type MenuActionId =
  | "copyHookSnippet"
  | "openSetupGuide"
  | "toggleEnabled"
  | "showLog"
  | "openSettings";

export interface MenuItem {
  id: MenuActionId;
  label: string;
  description: string;
}

/** Build the status-bar quick pick's items. Order is fixed; only the toggle label depends on state. */
export function buildMenuItems(enabled: boolean): MenuItem[] {
  return [
    {
      id: "copyHookSnippet",
      label: "$(clippy) Copy Hook Snippet",
      description: "Copy the Claude Code hook JSON to the clipboard",
    },
    {
      id: "openSetupGuide",
      label: "$(book) Open Setup Guide",
      description: "Show this extension's README (setup instructions)",
    },
    {
      id: "toggleEnabled",
      label: enabled ? "$(circle-slash) Disable Noroshi" : "$(check) Enable Noroshi",
      description: "Toggle noroshi.enabled",
    },
    {
      id: "showLog",
      label: "$(output) Show Output Log",
      description: "Open the Noroshi output channel",
    },
    {
      id: "openSettings",
      label: "$(gear) Open Settings",
      description: "Open Noroshi's settings",
    },
  ];
}

/**
 * Build the Claude Code hooks JSON for the current eventsFile setting, ready to
 * paste into .claude/settings.json. A relative eventsFile is anchored under
 * $CLAUDE_PROJECT_DIR; an absolute one (a remote/Pod path) is used as-is.
 */
export function buildHookSnippet(eventsFile: string): string {
  const target = isAbsolutePath(eventsFile) ? eventsFile : `$CLAUDE_PROJECT_DIR/${eventsFile}`;
  const obj = {
    hooks: {
      Notification: [
        { hooks: [{ type: "command", command: hookCommand("notification", target) }] },
      ],
      // Fires correctly in the terminal CLI; currently a no-op in the VSCode
      // extension, which has no handler for this control-request subtype
      // (github.com/anthropics/claude-code/issues/8985#issuecomment-3798023834),
      // so include it now for when that upstream bug is fixed.
      PermissionRequest: [
        { hooks: [{ type: "command", command: hookCommand("notification", target) }] },
      ],
      Stop: [{ hooks: [{ type: "command", command: hookCommand("stop", target) }] }],
    },
  };
  return JSON.stringify(obj, null, 2);
}

function hookCommand(kind: "notification" | "stop", target: string): string {
  return (
    `printf '{"event":"${kind}","entrypoint":"%s"}\\n' ` +
    `"\${CLAUDE_CODE_ENTRYPOINT:-unknown}" >> "${target}"  # noroshi`
  );
}
