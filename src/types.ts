/** One JSON event line. Written by the hook, read by DrainCore. */
export interface RawEvent {
  /** Event kind. Known values: 'notification' | 'stop'. Unknown values are ignored by the player. */
  event: string;
  /** Session entrypoint discriminator (see spec 7.1). May be absent. */
  entrypoint?: string;
}
