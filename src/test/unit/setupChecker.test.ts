import { describe, it, expect } from "vitest";
import { FakeFileSystem } from "../fakes";
import { checkHooksConfigured } from "../../setupChecker";

const MARKER = "# noroshi";

describe("checkHooksConfigured", () => {
  it("true when a settings file contains the marker", async () => {
    const fs = new FakeFileSystem({ "mem://proj": `{"hooks":{}} # noroshi` });
    expect(await checkHooksConfigured(fs, ["mem://proj"], MARKER)).toBe(true);
  });
  it("false when no settings file contains the marker", async () => {
    const fs = new FakeFileSystem({ "mem://proj": `{"hooks":{}}` });
    expect(await checkHooksConfigured(fs, ["mem://proj"], MARKER)).toBe(false);
  });
  it("skips a missing file and returns false", async () => {
    const fs = new FakeFileSystem();
    expect(await checkHooksConfigured(fs, ["mem://none"], MARKER)).toBe(false);
  });
  it("true when any one of several files contains the marker", async () => {
    const fs = new FakeFileSystem({
      "mem://a": `{}`,
      "mem://b": `whatever # noroshi here`,
    });
    expect(await checkHooksConfigured(fs, ["mem://a", "mem://b"], MARKER)).toBe(true);
  });
});
