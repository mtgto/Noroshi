import { describe, it, expect } from "vitest";
import type { RawEvent } from "../../types";

describe("harness", () => {
  it("RawEvent shape compiles and vitest runs", () => {
    const e: RawEvent = { event: "stop" };
    expect(e.event).toBe("stop");
  });
});
