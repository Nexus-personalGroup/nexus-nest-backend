## Why

「建立 change 的指令必須帶 `--schema spec-driven-custom`」這條守則**只掃 `.claude/`**，
而教人怎麼建 change 的權威文件是 `openspec/project/openspec-conventions.md`
——`CLAUDE.md` 明確把讀者指過去的那一份。

```
守則的掃描範圍：walk('.claude')
未被涵蓋：openspec/project/openspec-conventions.md:25
          openspec new change "<name>" --schema spec-driven-custom
```

那一行目前是對的，**但沒有任何東西守著它**。這是這條守則當初要防的問題的同一種形狀：
**有兩份真相，只守其中一份。** 守則的註解自己寫著
「propose 流程在 `.claude/skills/` 與 `.claude/commands/opsx/` 各有一份，
只檢查其中一份的結果，就是改了 skill、command 卻靜默留在內建 schema」
——現在第三份在 `openspec/project/`。

漏掉的後果與原本一樣且靜默：`openspec config` 只支援 global scope，
專案預設 schema 進不了版控，少帶旗標就會落回內建 schema，**所有格式規範一條都不生效**。

## What Changes

- 掃描範圍從 `.claude/` 擴大到**所有現行的指示文件**：
  `.claude/`、`openspec/`、`CLAUDE.md`、`README.md`。
- **`openspec/changes/archive/` 明確排除**——封存的是歷史，
  歷史不該因為今天的規則改變而變紅（見 design D2）。
  ⚠️ 掃**整個** `openspec/` 而非只掃 `openspec/project/`，是為了讓這條排除
  **承重**：只掃 project 的話封存區根本不在路徑上，排除會變成永遠碰不到的
  死程式碼，而「反向驗證通過」也只是因為沒掃到，不是因為排除生效。
- 需求的 scenario 跟著改：範圍從「`.claude/` 底下任一份文件」改為
  「現行指示文件」，並寫明排除封存區。

## Capabilities

### Modified Capabilities

- `platform-engineering-guardrails`：「openspec 自訂 schema 的執行路徑檢查」
  的掃描範圍擴大，並明確排除封存區。

## Impact

| 面向 | 影響 |
| --- | --- |
| Schema / migration | 無 |
| 環境變數 | 無 |
| API 契約 / Swagger | 無 |
| 前端 | 無 |
| 行為變更 | 無執行期影響；只有守則的掃描範圍變大 |

**擴大之後會直接綠**：實掃三處呼叫
（`.claude/skills/openspec-propose/SKILL.md`、`openspec/project/openspec-conventions.md`、
本 change 自己的 proposal），三處都已帶旗標，封存區 0 處。散文中的提及（`tasks/lessons.md`、封存的 design）不會被誤判——
正則要求 `openspec new change` 後面接引號或 `<`，而那些後面接的是反引號。
