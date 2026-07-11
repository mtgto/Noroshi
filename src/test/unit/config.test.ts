import { describe, it, expect } from "vitest";
import { resolvePlayerCommand, buildPlayCommand, clampNonNegative } from "../../config";

describe("resolvePlayerCommand", () => {
  it("respects an explicit setting", () => {
    expect(resolvePlayerCommand('ffplay "${file}"', "linux")).toBe('ffplay "${file}"');
  });
  it("defaults to afplay on macOS when empty", () => {
    expect(resolvePlayerCommand("", "darwin")).toBe('afplay "${file}"');
  });
  it("defaults to paplay on Linux when empty", () => {
    expect(resolvePlayerCommand("", "linux")).toBe('paplay "${file}"');
  });
  it("defaults to SoundPlayer on Windows when empty", () => {
    expect(resolvePlayerCommand("", "win32")).toContain("Media.SoundPlayer");
  });
  it("falls back to paplay for unknown platforms", () => {
    expect(resolvePlayerCommand("", "freebsd" as NodeJS.Platform)).toBe('paplay "${file}"');
  });
});

describe("buildPlayCommand", () => {
  it("replaces every ${file}", () => {
    expect(buildPlayCommand('afplay "${file}"', "/a/b.wav")).toBe('afplay "/a/b.wav"');
  });
});

describe("clampNonNegative", () => {
  it("falls back on negative / NaN", () => {
    expect(clampNonNegative(-1, 3000)).toBe(3000);
    expect(clampNonNegative(NaN, 3000)).toBe(3000);
  });
  it("passes 0 and positive values through", () => {
    expect(clampNonNegative(0, 3000)).toBe(0);
    expect(clampNonNegative(250, 3000)).toBe(250);
  });
});
