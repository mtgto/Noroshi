import { describe, it, expect } from "vitest";
import { FakeFileSystem } from "../fakes";
import { checkHooksConfigured } from "../../setupChecker";

const NEEDLE = ".claude/noroshi-events.jsonl";

describe("checkHooksConfigured", () => {
  it("false when no settings file contains the needle", async () => {
    const fs = new FakeFileSystem({ "mem://proj": `{"hooks":{}}` });
    expect(await checkHooksConfigured(fs, ["mem://proj"], NEEDLE)).toBe(false);
  });
  it("skips a missing file and returns false", async () => {
    const fs = new FakeFileSystem();
    expect(await checkHooksConfigured(fs, ["mem://none"], NEEDLE)).toBe(false);
  });
  it("true when any one of several files contains the needle", async () => {
    const fs = new FakeFileSystem({
      "mem://a": `{}`,
      "mem://b": `... >> "$CLAUDE_PROJECT_DIR/.claude/noroshi-events.jsonl" ...`,
    });
    expect(await checkHooksConfigured(fs, ["mem://a", "mem://b"], NEEDLE)).toBe(true);
  });
  it("detects a hand-written hook with no marker comment, via the eventsFile path", async () => {
    const eventsFile = ".claude/noroshi-events.jsonl";
    const fs = new FakeFileSystem({
      "mem://proj": JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [
                {
                  type: "command",
                  command: `echo '{"event":"stop"}' >> "$CLAUDE_PROJECT_DIR/${eventsFile}"`,
                },
              ],
            },
          ],
        },
      }),
    });
    expect(await checkHooksConfigured(fs, ["mem://proj"], eventsFile)).toBe(true);
  });
});
