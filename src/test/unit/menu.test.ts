import { describe, it, expect } from "vitest";
import { buildMenuItems } from "../../menu";

describe("buildMenuItems", () => {
  it("returns the expected actions in a fixed order", () => {
    const items = buildMenuItems(true);
    expect(items.map((i) => i.id)).toEqual([
      "installHooks",
      "openSetupGuide",
      "toggleEnabled",
      "showLog",
      "openSettings",
    ]);
  });

  it("labels the toggle as Disable when currently enabled", () => {
    const toggle = buildMenuItems(true).find((i) => i.id === "toggleEnabled");
    expect(toggle?.label).toMatch(/Disable/);
  });

  it("labels the toggle as Enable when currently disabled", () => {
    const toggle = buildMenuItems(false).find((i) => i.id === "toggleEnabled");
    expect(toggle?.label).toMatch(/Enable/);
  });
});
