> 驗證鏈：`pnpm --filter @app/api test:arch`（這支只動守則，不需要 e2e）
>
> **驗證一律看 exit code**，指令不接 pipe。
> 反向驗證要**兩邊都看**、並確認**紅的是哪一支**。
>
> **這個 change 沒有 schema、migration、新環境變數、API 契約、前端變更。**

## 1. 擴大掃描範圍

- [x] 1.1 `openspec-schema.spec.ts` 的 `walk('.claude')` 改為掃一份
      **具名的現行指示文件清單**：`.claude/`、`openspec/`、`CLAUDE.md`、`README.md`。
      ⚠️ **提案原本寫 `openspec/project/`，實作時改成整個 `openspec/`**——
      只掃 project 的話封存區不在路徑上，下一項的排除會變成死程式碼
- [x] 1.2 ⭐ **明確排除 `openspec/changes/archive/`**，並在程式碼註解寫明理由
      （封存是歷史，今天的規則不該讓昨天的紀錄變紅）
- [x] 1.3 正則**不動**——只認 `openspec new change` 後面接引號或 `<` 的真正呼叫。
      散文提及（後面接反引號）不該被判為違規
- [x] 1.4 既有的「掃到的呼叫數量 > 0」斷言保留

## 2. 反向驗證

- [x] 2.1 ⭐ 在 `openspec/project/openspec-conventions.md` 把 `--schema` 拿掉
      → **紅**，且確認紅的是這一支；還原 → 綠。
      **這是本次的核心**：改之前這個情境是綠的，所以是可構造的真實對照
- [x] 2.2 ⭐ 在封存區塞一個未帶旗標的呼叫 → **仍然綠**；清掉。
      **並且證明那是排除生效而不是沒掃到**：拿掉 `ARCHIVE_PREFIX` 那一行 →
      同一筆注入立刻被抓出（訊息指名封存檔）→ 還原
- [x] 2.3 掃描範圍失效要紅：把清單改成不存在的目錄 → 呼叫數 0 → 紅
- [x] 2.4 現況直接綠（現行文件的兩處呼叫都已帶旗標）

## 3. 收尾

- [x] 3.1 `pnpm typecheck && pnpm lint && pnpm test:cov` 全綠
- [x] 3.2 `openspec validate widen-schema-flag-scan --strict`
- [x] 3.3 `openspec/project/testing.md` 的守則表：該列若寫了掃描範圍需同步
- [x] 3.4 `tasks/todo.md`：整體整理
- [x] 3.5 `tasks/lessons.md`：**只在有新東西時才補**。
      「守則的掃描範圍要跟著真相的份數走」與 #40 記的
      「搬移邏輯會讓只掃原檔的守則空轉」是同一族，可能不必再記一條
- [ ] 3.6 `openspec archive widen-schema-flag-scan`
