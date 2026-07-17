export type MenuActionId =
  | "installHooks"
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
      id: "installHooks",
      label: "$(cloud-download) Install Claude Code Hooks",
      description: "Add the hooks to this workspace's .claude/settings",
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
