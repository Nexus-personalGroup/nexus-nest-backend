## ADDED Requirements

### Requirement: 基礎設施探針必須豁免於 IP 存取控制

健康檢查與指標端點（`/api/health*`、`/api/metrics`）SHALL 不受
IP 白名單／黑名單 guard 限制。

**理由：這兩者是給機器用的，不是使用者流量。** IP ACL 的目的是限制
**使用者**能從哪些位址存取後台；把 liveness 探針算進「使用者」，
換來的不是安全而是**服務停擺**：

- 容器：healthcheck 打 `/api/health` 被 403 → api unhealthy →
  依賴 `service_healthy` 的代理永不啟動 → **整組起不來**
- 正式環境：k8s liveness probe 被 403 → **CrashLoopBackOff**

探針來自叢集內部或容器自身，其來源位址**本來就不會**出現在
為外部使用者設計的白名單裡。

豁免 MUST 以**明示的表態**達成，MUST NOT 靠路徑前綴默默生效：

- **裝飾器標記** —— 給本專案自有的 controller（`HealthController`）
- **顯式路徑清單** —— 給無法掛裝飾器的第三方 controller（`/api/metrics`），
  MUST 用精確比對（去除 query string 後），MUST NOT 用 `startsWith`

⚠️ **MUST NOT 以 `@Public()` 作為豁免依據。** `@Public()` 的語意是
「不需要身分」，它同時掛在**登入／註冊**端點上，而擋惡意來源打登入
正是 IP 黑名單存在的主要理由。用 `@Public()` 當判準等於讓黑名單對登入失效
——**那是用一個安全缺陷換掉一個可用性缺陷**。
判準必須是「這是不是基礎設施探針」，不是「需不需要認證」。

需要限制探針來源時，正確的位置是**網路層**（反向代理的位址限制、
k8s NetworkPolicy），MUST NOT 退回應用層的使用者 ACL。

豁免清單 MUST 每筆寫理由，且 MUST 隨路由存在而有效——
指向已不存在路徑的豁免是死字串。

#### Scenario: ⭐ 白名單開啟且清單為空

- **WHEN** `APPLICATION_IP_WHITELIST_ENABLED=true` 而白名單沒有任何一筆
- **THEN** 所有使用者流量 MUST 被拒（fail-closed 是正確的），
  但 `/api/health` 與 `/api/metrics` MUST 仍回 200——
  服務 MUST 能通過健康檢查

#### Scenario: ⭐ 以 `@Public()` 作為 IP ACL 的豁免依據

- **WHEN** IP guard 讀 `IS_PUBLIC_KEY` 來決定是否放行
- **THEN** 守則失敗——登入端點會因此不受黑名單保護

#### Scenario: 以前綴比對豁免探針路徑

- **WHEN** IP guard 用 `startsWith` 或前綴正規式判斷是否跳過
- **THEN** 守則失敗——豁免必須精確到單一路徑

#### Scenario: 豁免清單有過期項目

- **WHEN** 清單列有應用程式已不存在的路徑
- **THEN** 守則失敗——路由移除後遺留的死字串
