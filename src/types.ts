/** 1 行の JSON イベント。フックが書き、DrainCore が読む。 */
export interface RawEvent {
  /** イベント種別。既知は 'notification' | 'stop'。未知値は再生側で無視。 */
  event: string;
  /** セッション起動経路の判別子 (§7.1)。無い場合もある。 */
  entrypoint?: string;
}
