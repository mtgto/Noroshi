import { describe, it, expect } from "vitest";
import {
  resolvePlayerCommand,
  splitCommandLine,
  buildPlayCommand,
  clampNonNegative,
  isAbsolutePath,
} from "../../config";

describe("resolvePlayerCommand", () => {
  it("respects an explicit setting, split into argv", () => {
    expect(resolvePlayerCommand("ffplay ${file}", "linux")).toEqual(["ffplay", "${file}"]);
  });
  it("defaults to afplay on macOS when empty", () => {
    expect(resolvePlayerCommand("", "darwin")).toEqual(["afplay", "${file}"]);
  });
  it("defaults to paplay on Linux when empty", () => {
    expect(resolvePlayerCommand("", "linux")).toEqual(["paplay", "${file}"]);
  });
  it("defaults to SoundPlayer on Windows when empty", () => {
    expect(resolvePlayerCommand("", "win32").join(" ")).toContain("Media.SoundPlayer");
  });
  it("falls back to paplay for unknown platforms", () => {
    expect(resolvePlayerCommand("", "freebsd" as NodeJS.Platform)).toEqual(["paplay", "${file}"]);
  });
});

describe("splitCommandLine", () => {
  it("splits on whitespace", () => {
    expect(splitCommandLine("ffplay -nodisp -autoexit ${file}")).toEqual([
      "ffplay",
      "-nodisp",
      "-autoexit",
      "${file}",
    ]);
  });
  it("groups a quoted span containing spaces into one token", () => {
    expect(splitCommandLine('node -e "console.log(1)"')).toEqual(["node", "-e", "console.log(1)"]);
  });
  it("treats an embedded quote of a different kind as literal", () => {
    expect(splitCommandLine(`node -e "require('fs')"`)).toEqual(["node", "-e", "require('fs')"]);
  });
});

describe("buildPlayCommand", () => {
  it("replaces every ${file} token with the literal path (no shell quoting)", () => {
    expect(buildPlayCommand(["afplay", "${file}"], "/a/b.wav")).toEqual(["afplay", "/a/b.wav"]);
  });
  it("substitutes ${file} even when embedded inside a larger token", () => {
    expect(buildPlayCommand(["echo", "path=${file}"], "/a/b.wav")).toEqual([
      "echo",
      "path=/a/b.wav",
    ]);
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
