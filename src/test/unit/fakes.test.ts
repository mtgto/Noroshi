import { describe, it, expect } from "vitest";
import { FakeFileSystem } from "../fakes";

describe("FakeFileSystem", () => {
  it("不在ファイルの stat は null", async () => {
    const fs = new FakeFileSystem();
    expect(await fs.stat("x")).toBeNull();
  });
  it("書いた内容を読める・サイズが出る", async () => {
    const fs = new FakeFileSystem({ a: "hello" });
    expect(await fs.readFile("a")).toBe("hello");
    expect(await fs.stat("a")).toEqual({ size: 5 });
  });
  it("rename は移動し、元は消える", async () => {
    const fs = new FakeFileSystem({ a: "x" });
    await fs.rename("a", "b");
    expect(await fs.stat("a")).toBeNull();
    expect(await fs.readFile("b")).toBe("x");
  });
  it("不在元の rename は ENOENT を投げる", async () => {
    const fs = new FakeFileSystem();
    await expect(fs.rename("none", "b")).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("delete は消す。不在 delete は無害", async () => {
    const fs = new FakeFileSystem({ a: "x" });
    await fs.delete("a");
    await fs.delete("a");
    expect(await fs.stat("a")).toBeNull();
  });
});
