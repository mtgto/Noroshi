import * as vscode from "vscode";

export type NoroshiState = "active" | "unconfigured" | "disabled";

const ICON: Record<NoroshiState, string> = {
  active: "$(unmute)",
  unconfigured: "$(warning)",
  disabled: "$(mute)",
};

export class NoroshiStatusBar {
  constructor(
    private readonly item: vscode.StatusBarItem,
    openSetupCommand: string,
  ) {
    this.item.command = openSetupCommand;
  }

  update(state: NoroshiState, tooltip: string): void {
    this.item.text = `${ICON[state]} Noroshi`;
    this.item.tooltip = tooltip;
  }

  setVisible(v: boolean): void {
    if (v) this.item.show();
    else this.item.hide();
  }

  dispose(): void {
    this.item.dispose();
  }
}
