/**
 * setTimeout/clearTimeout seam. The existing Clock only exposes now(), which
 * serves Player's debounce; ToolWaitTracker needs to schedule work, so it gets
 * its own seam rather than widening Clock's contract.
 */
export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export class RealTimers implements Timers {
  setTimeout(fn: () => void, ms: number): unknown {
    return globalThis.setTimeout(fn, ms);
  }
  clearTimeout(handle: unknown): void {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
  }
}
