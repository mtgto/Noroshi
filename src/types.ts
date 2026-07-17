/** One JSON event line. Written by the hook, read by DrainCore. */
export interface RawEvent {
  /** Event kind. Known values: 'notification' | 'stop' | 'tool_start' | 'tool_end'. Unknown values are ignored by the player. */
  event: string;
  /** Session entrypoint discriminator (see spec 7.1). May be absent. */
  entrypoint?: string;
  /** Present on tool_start/tool_end/stop lines written by a JSON-parsing hook. */
  session_id?: string;
  prompt_id?: string;
  /** Present on tool_start/tool_end lines only. */
  tool_name?: string;
}
