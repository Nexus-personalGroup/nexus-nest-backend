## ADDED Requirements

### Requirement: 分層守則必須涵蓋所有 in 側進入點，不限 Controller

「不得直接相依持久層」的檢查 SHALL 涵蓋 `adapter/in/` 下**所有**進入點類型，
包含 `*Controller.ts` 與 `*Gateway.ts`，以及日後新增的其他進入點形式。

以檔名後綴限定掃描範圍時，MUST 同時檢查「範圍內確實掃到檔案」與「新增的進入點類型
不會落在範圍外」。規則本身正確但掃描範圍寫死在既有型別，是本專案已發生過的缺陷型態——
新的進入點會在完全沒有阻力的情況下違反一條「已經存在」的規則。

#### Scenario: Gateway 直接注入持久層

- **WHEN** `adapter/in/ws/` 下的 gateway import Prisma 或 repository
- **THEN** 分層守則失敗，訊息包含違規檔案與行號

#### Scenario: 新增第三種進入點類型

- **WHEN** 新增既非 Controller 也非 Gateway 的進入點
- **THEN** 該類型 MUST 被納入掃描範圍，否則守則的涵蓋率會隨架構演進而靜默衰退

### Requirement: 外部輸入的 schema 驗證守則必須涵蓋非 HTTP 進入點

「DTO 一律由 Zod 推導」的檢查 SHALL 涵蓋所有接受外部輸入的進入點，
不限於 `adapter/in/web`。

WebSocket 事件 payload 與 HTTP request body 的信任等級相同，
把驗證守則的掃描範圍綁在 HTTP 目錄等於默許 WS 走較寬鬆的標準。

#### Scenario: WS 事件型別以 interface 手寫

- **WHEN** `adapter/in/ws/` 下出現手寫的 payload 型別而非 `z.infer`
- **THEN** 守則失敗

### Requirement: 授權涵蓋率守則必須涵蓋 WebSocket 事件 handler

「進入點必須有明確的授權標註」的檢查 SHALL 涵蓋 WebSocket 的事件 handler。

漏掛認證的 handler 與漏掛授權的 controller 是同一種缺陷：**它遵守了所有現存規則，
只是缺少沒有規則要求它具備的東西**。本專案已因此發生過一次附件端點的 IDOR。

#### Scenario: 事件 handler 未標註認證

- **WHEN** `@SubscribeMessage` 的 handler 既無認證標註、也未列入豁免清單
- **THEN** 守則失敗

#### Scenario: 豁免項目未說明理由

- **WHEN** 某 handler 被列入豁免清單但未註明理由
- **THEN** 守則失敗——豁免清單失去理由就會逐漸長大
