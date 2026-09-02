## ADDED Requirements

### Requirement: 守則手段的守備範圍必須寫下來

`openspec/project/testing.md` SHALL 記載兩種驗證手段各自擋得住什麼、擋不住什麼，
並說明**如何選**。

專案目前有兩種互補的手段，而它們的守備範圍不重疊：

| 手段 | 擋得住 | 擋不住 |
| --- | --- | --- |
| **讀原始碼字面值的守則**（正規式掃 constants／裝飾器） | 兩處常數漂移；守衛被移除或註解掉；權限碼移除後遺留的死字串 | **值本身是錯的**（兩邊一致地錯）；守衛還在但語意變了；執行期行為 |
| **直接斷言輸出的測試** | 值本身錯（例如組給外部世界的 URL 用錯 base） | 兩處常數是否同步；規則有沒有被繞過 |

判準 MUST 寫明：**錯的是「兩處不一致」還是「值本身」**——
前者用守則，後者只有斷言輸出擋得到。

**兩節 MUST 互相指向。** 它們目前各自存在，讀到其中一節的人不會知道另一半，
於是下一個新問題會被套上手邊那一招而不是對的那一招。

這條的來源是實證：三輪審查中「測試綠但沒驗到」出現三次，
解法都收斂到守則那一招；而第二輪最嚴重的問題（驗證信連結用錯 base URL）
恰好是守則擋不住的那一類——**兩處一致地錯**。

#### Scenario: ⭐ 新發現一個「兩處常數會漂移」的風險

- **WHEN** 有人要為它加防護
- **THEN** `testing.md` MUST 讀得出「這一類用讀字面值的守則」

#### Scenario: ⭐ 新發現一個「組給外部的字串可能組錯」的風險

- **WHEN** 有人要為它加防護
- **THEN** `testing.md` MUST 讀得出「守則擋不到這一類，要直接斷言輸出」

### Requirement: 動到模組接線必須跑 e2e

`openspec/project/testing.md` SHALL 記載：**`pnpm build` 綠不代表 DI 組得起來**，
動到 NestJS 模組接線（provider、`imports`、`exports`）時 MUST 跑
`pnpm --filter @app/api test:e2e`。

Nest 的模組圖在**執行期**組裝，`tsc` 與 `nest build` 都不檢查它。
專案已踩過兩次：

- `@Inject(METRICS_PORT)` 加進 `PrismaAccountLockAdapter` 而 `MetricsModule`
  不是 `@Global()`——打掛 10 支 e2e，而 typecheck / lint / test 全綠。
- `ChatWsModule` 的 `exports` 留著一個它已不再 provide 的 token——
  **`pnpm build` 也是綠的**，e2e 409 支全紅。

兩次的共同特徵是「綠燈的組合看起來像沒事」：`build` 過去了，
於是很容易判斷成可以推上去。記下來的目的是讓下一個人不必用一輪 CI 換這個結論。

#### Scenario: ⭐ 搬移 provider 之後只跑了 build

- **WHEN** 改動模組的 `providers` / `imports` / `exports` 後只跑 `pnpm build` 與 `pnpm test`
- **THEN** 那不足以判斷接線正確——`testing.md` MUST 說明這一點
