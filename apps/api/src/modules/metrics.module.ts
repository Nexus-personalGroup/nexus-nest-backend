import { Module, Provider } from '@nestjs/common';
import {
  makeCounterProvider,
  makeGaugeProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';
import { METRICS_PORT } from '@app/application/port/out/MetricsPort';
import { NoopMetricsAdapter } from '@app/adapter/out/metrics/NoopMetricsAdapter';
import {
  METRIC_NAMES,
  PrometheusMetricsAdapter,
} from '@app/adapter/out/metrics/PrometheusMetricsAdapter';
import { getEnv } from '@app/infrastructure/validate-env';

/**
 * 指標的 provider。
 *
 * 只在 `APPLICATION_METRICS_ENABLED` 開啟時註冊 Prometheus 實作；關閉時綁 no-op，
 * **業務程式碼因此不需要判斷開關**——「要不要記」是接線層的決定，
 * 不該散落在每個呼叫點成為一堆 if。
 *
 * 這也是為什麼稽核與指標用不同的環境變數（見 `add-chat-observability` 的 design.md）：
 * 指標關掉只是看不到趨勢，稽核關掉會讓調查沒有依據。
 */
const metricsProviders = (): Provider[] =>
  getEnv().APPLICATION_METRICS_ENABLED
    ? [
        makeCounterProvider({
          name: METRIC_NAMES.MESSAGES,
          help: '送出的聊天訊息總數',
        }),
        makeHistogramProvider({
          name: METRIC_NAMES.WRITE_SECONDS,
          help: '訊息寫入耗時（秒），含配號的鎖等待',
          // 桶取到 1 秒：同一房間的寫入被序列化，排隊時要看得出長尾
          buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
        }),
        makeCounterProvider({
          name: METRIC_NAMES.RATE_LIMITED,
          help: '被限流擋下的送訊息次數',
        }),
        makeCounterProvider({
          name: METRIC_NAMES.WS_EVENTS,
          help: 'WebSocket 事件數，依事件名與結果分類',
          labelNames: ['event', 'outcome'],
        }),
        makeGaugeProvider({
          name: METRIC_NAMES.CONNECTIONS,
          help: '目前的 WebSocket 連線數（單一實例）',
        }),
        makeHistogramProvider({
          name: METRIC_NAMES.HEARTBEAT_SECONDS,
          help: '單輪心跳的耗時（秒）',
          // 桶取到心跳間隔的量級：逼近週期時要看得出來
          buckets: [0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10, 15],
        }),
        makeCounterProvider({
          name: METRIC_NAMES.HEARTBEAT_SKIPPED,
          help: '因上一輪未完成而被跳過的心跳輪數',
        }),
        makeCounterProvider({
          name: METRIC_NAMES.SECURITY_DEGRADED,
          help: '安全防護因相依不可用而降級放行的次數，依防護分類',
          labelNames: ['guard'],
        }),
        makeHistogramProvider({
          name: METRIC_NAMES.DASHBOARD_QUERY_SECONDS,
          help: '營運快照中單一查詢的耗時（秒），依查詢名分類',
          labelNames: ['query'],
          // 桶跨三個數量級：現在應該都在毫秒級，而要看的正是「哪一個開始不是」。
          // 上限取到快照週期（預設 5 秒）——超過就代表下一輪已經追上來了
          buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2.5, 5],
        }),
        PrometheusMetricsAdapter,
        { provide: METRICS_PORT, useExisting: PrometheusMetricsAdapter },
      ]
    : [
        NoopMetricsAdapter,
        { provide: METRICS_PORT, useExisting: NoopMetricsAdapter },
      ];

@Module({
  providers: metricsProviders(),
  exports: [METRICS_PORT],
})
export class MetricsModule {}
