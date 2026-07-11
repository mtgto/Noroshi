import { describe, it, expect } from "vitest";
import {
  resolvePlayerCommand,
  buildPlayCommand,
  shellQuote,
  clampNonNegative,
  isAbsolutePath,
} from "../../config";

describe("resolvePlayerCommand", () => {
  it("respects an explicit setting", () => {
    expect(resolvePlayerCommand("ffplay ${file}", "linux")).toBe("ffplay ${file}");
  });
  it("defaults to afplay on macOS when empty", () => {
    expect(resolvePlayerCommand("", "darwin")).toBe("afplay ${file}");
  });
  it("defaults to paplay on Linux when empty", () => {
    expect(resolvePlayerCommand("", "linux")).toBe("paplay ${file}");
  });
  it("defaults to SoundPlayer on Windows when empty", () => {
    expect(resolvePlayerCommand("", "win32")).toContain("Media.SoundPlayer");
  });
  it("falls back to paplay for unknown platforms", () => {
    expect(resolvePlayerCommand("", "freebsd" as NodeJS.Platform)).toBe("paplay ${file}");
  });
});

describe("buildPlayCommand", () => {
  it("replaces every ${file} with the given value", () => {
    expect(buildPlayCommand("afplay ${file}", "'/a/b.wav'")).toBe("afplay '/a/b.wav'");
  });
});

describe("shellQuote", () => {
  it("single-quotes a POSIX path so spaces and metacharacters are literal", () => {
    expect(shellQuote("/a b/c$d.wav", "darwin")).toBe("'/a b/c$d.wav'");
  });
  it("escapes embedded single quotes on POSIX", () => {
    expect(shellQuote("/a'b.wav", "linux")).toBe(`'/a'\\''b.wav'`);
  });
  it("uses PowerShell single-quote doubling on Windows", () => {
    expect(shellQuote("C:\\a b\\it's.wav", "win32")).toBe("'C:\\a b\\it''s.wav'");
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

describe("isAbsolutePath", () => {
  it("recognizes POSIX absolute paths", () => {
    expect(isAbsolutePath("/home/u/.claude/events.jsonl")).toBe(true);
  });
  it("recognizes Windows drive-letter paths (both slash styles)", () => {
    expect(isAbsolutePath("C:\\tmp\\events.jsonl")).toBe(true);
    expect(isAbsolutePath("C:/tmp/events.jsonl")).toBe(true);
  });
  it("treats relative paths as not absolute", () => {
    expect(isAbsolutePath(".claude/noroshi-events.jsonl")).toBe(false);
    expect(isAbsolutePath("a/b.jsonl")).toBe(false);
  });
});
