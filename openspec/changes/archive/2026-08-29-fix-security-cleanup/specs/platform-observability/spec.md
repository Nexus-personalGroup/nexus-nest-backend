## ADDED Requirements

### Requirement: 安全防護的降級必須可觀測

凡是在相依服務不可用時**選擇放行**的安全防護路徑，
MUST 記錄警告層級的日誌，且 MUST 有對應的指標。
靜默放行 MUST 視為違反本需求。

**這條守的不是「該不該降級」，是「降級了有沒有人知道」。**
登入失敗計數與 IP 失敗計數在 Redis 不可用時回 0，
於是「失敗次數達到門檻」永遠不成立——帳號鎖定與 IP 黑名單**整組不會觸發**。
那是刻意的 graceful degradation，本需求不推翻它；問題在於它**完全沒有痕跡**：
Redis 掛掉的期間可以無限次猜密碼，而事後翻日誌也看不出那段時間發生過什麼。

方向的不一致才是真正值得記錄的地方：同一個 Redis client，
認證路徑（`isBlacklisted`）選 **fail-closed**——不可用就整站 503；
暴力破解防護選 **fail-open**——不可用就不擋。兩個方向相反的選擇各自都可辯護，
但**沉默的那一邊風險更高**：503 會有人立刻發現，靜默放行不會。

指標 MUST 能區分「降級發生了幾次」與「正常路徑跑了幾次」，
否則無法回答「上週那波登入嘗試是在防護有效還是失效的時候發生的」。

#### Scenario: Redis 不可用時記錄一次失敗登入

- **WHEN** `recordFailedLogin` 在 Redis 不可用時被呼叫
- **THEN** MUST 輸出警告日誌，MUST 遞增降級指標，且 MUST 仍然回傳（不阻塞登入流程）

#### Scenario: Redis 不可用時記錄一次 IP 失敗

- **WHEN** `recordFailedIpAttempt` 在 Redis 不可用時被呼叫
- **THEN** 行為同上——兩條路徑 MUST NOT 只做其中一條

#### Scenario: Redis 正常時

- **WHEN** Redis 可用
- **THEN** MUST NOT 輸出降級警告，MUST NOT 遞增降級指標

#### Scenario: 新增一條會降級的防護路徑

- **WHEN** 日後新增的防護在相依不可用時選擇放行，但沒有日誌也沒有指標
- **THEN** 違反本需求
