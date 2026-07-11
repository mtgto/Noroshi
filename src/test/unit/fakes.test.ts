import { describe, it, expect } from "vitest";
import { FakeFileSystem } from "../fakes";

describe("FakeFileSystem", () => {
  it("stat of a missing file is null", async () => {
    const fs = new FakeFileSystem();
    expect(await fs.stat("x")).toBeNull();
  });
  it("reads back written content and reports size", async () => {
    const fs = new FakeFileSystem({ a: "hello" });
    expect(await fs.readFile("a")).toBe("hello");
    expect(await fs.stat("a")).toEqual({ size: 5 });
  });
  it("rename moves the entry and clears the source", async () => {
    const fs = new FakeFileSystem({ a: "x" });
    await fs.rename("a", "b");
    expect(await fs.stat("a")).toBeNull();
    expect(await fs.readFile("b")).toBe("x");
  });
  it("rename of a missing source throws ENOENT", async () => {
    const fs = new FakeFileSystem();
    await expect(fs.rename("none", "b")).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("delete removes; deleting a missing entry is harmless", async () => {
    const fs = new FakeFileSystem({ a: "x" });
    await fs.delete("a");
    await fs.delete("a");
    expect(await fs.stat("a")).toBeNull();
  });
});
