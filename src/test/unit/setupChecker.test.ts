import { describe, it, expect } from "vitest";
import { FakeFileSystem } from "../fakes";
import { checkHooksConfigured } from "../../setupChecker";

const MARKER = "# noroshi";

describe("checkHooksConfigured", () => {
  it("マーカーを含む settings があれば true", async () => {
    const fs = new FakeFileSystem({ "mem://proj": `{"hooks":{}} # noroshi` });
    expect(await checkHooksConfigured(fs, ["mem://proj"], MARKER)).toBe(true);
  });
  it("どの settings にもマーカーが無ければ false", async () => {
    const fs = new FakeFileSystem({ "mem://proj": `{"hooks":{}}` });
    expect(await checkHooksConfigured(fs, ["mem://proj"], MARKER)).toBe(false);
  });
  it("ファイル不在は skip し false", async () => {
    const fs = new FakeFileSystem();
    expect(await checkHooksConfigured(fs, ["mem://none"], MARKER)).toBe(false);
  });
  it("複数のうち 1 つでも含めば true", async () => {
    const fs = new FakeFileSystem({
      "mem://a": `{}`,
      "mem://b": `whatever # noroshi here`,
    });
    expect(await checkHooksConfigured(fs, ["mem://a", "mem://b"], MARKER)).toBe(true);
  });
});
