import { describe, it, expect } from "vitest";
import { resolvePlayerCommand, buildPlayCommand, clampNonNegative } from "../../config";

describe("resolvePlayerCommand", () => {
  it("明示設定があればそれを尊重する", () => {
    expect(resolvePlayerCommand('ffplay "${file}"', "linux")).toBe('ffplay "${file}"');
  });
  it("空なら macOS は afplay", () => {
    expect(resolvePlayerCommand("", "darwin")).toBe('afplay "${file}"');
  });
  it("空なら Linux は paplay", () => {
    expect(resolvePlayerCommand("", "linux")).toBe('paplay "${file}"');
  });
  it("空なら Windows は SoundPlayer", () => {
    expect(resolvePlayerCommand("", "win32")).toContain("Media.SoundPlayer");
  });
  it("未知 platform は afplay に寄せず paplay を既定にする", () => {
    expect(resolvePlayerCommand("", "freebsd" as NodeJS.Platform)).toBe('paplay "${file}"');
  });
});

describe("buildPlayCommand", () => {
  it("${file} を全て置換する", () => {
    expect(buildPlayCommand('afplay "${file}"', "/a/b.wav")).toBe('afplay "/a/b.wav"');
  });
});

describe("clampNonNegative", () => {
  it("負値/NaN は fallback", () => {
    expect(clampNonNegative(-1, 3000)).toBe(3000);
    expect(clampNonNegative(NaN, 3000)).toBe(3000);
  });
  it("0 と正値はそのまま", () => {
    expect(clampNonNegative(0, 3000)).toBe(0);
    expect(clampNonNegative(250, 3000)).toBe(250);
  });
});
