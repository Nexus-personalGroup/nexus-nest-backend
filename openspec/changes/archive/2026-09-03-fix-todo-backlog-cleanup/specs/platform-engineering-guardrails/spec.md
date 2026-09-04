## ADDED Requirements

### Requirement: master spec 的 requirement 必須在開頭第一行表態

每一條 master spec 的 requirement SHALL 在**開頭段落的第一行**就出現
`SHALL` 或 `MUST`，MUST NOT 先寫背景、把規定留到後面的段落或項目符號。

⚠️ **`MAY` 不算**——openspec 只認 `SHALL` 與 `MUST`。
純授權性質的 requirement（「MAY 這樣做」）仍 MUST 有一句 `SHALL` / `MUST`
界定它的邊界，通常是「這個放寬 MUST 被標記為暫時的」。
那句話本來就該寫：**沒有邊界的放寬會變成永久的預設**。

**這同時是工具限制與寫作規範。** openspec 的 validator 取
requirement 開頭段落的**第一行**當作 `text` 來檢查——
而本專案的排版在 80 字左右斷行，關鍵字落在第二行就等於沒寫。
2026-09-03 有 7 支 master spec 因此紅著，而**沒有任何檢查在跑它**。

即使沒有工具限制，這條也成立：**規定先講，理由後補**。
先寫三行背景再說要求的 requirement，讀者要讀到最後才知道到底規定了什麼。

檢查 MUST 涵蓋 `openspec/specs/` 下的每一支 spec，
且 MUST 在既有的測試路徑上執行（不新增只在本機跑的步驟）——
只在本機跑的檢查會隨著「這次先跳過」而失效。

檢查 MUST 斷言掃描範圍有效：讀不到任何 spec 或任何 requirement 時 MUST 失敗，
否則規則會空轉成「全部通過」。

#### Scenario: ⭐ normative 關鍵字在第二行

- **WHEN** requirement 的開頭段落斷行，`SHALL` 出現在第二行
- **THEN** 檢查失敗——openspec 的 validator 看不到它

#### Scenario: ⭐ 開頭只有 `MAY`

- **WHEN** requirement 的第一行只有 `MAY`，沒有 `SHALL` 或 `MUST`
- **THEN** 檢查失敗——放寬也要寫出它的邊界

#### Scenario: 開頭先寫背景

- **WHEN** requirement 以背景敘述開頭，規定寫在後面的項目符號裡
- **THEN** 檢查失敗

#### Scenario: 掃描範圍失效

- **WHEN** 目錄結構改變導致讀不到任何 requirement
- **THEN** 檢查 MUST 失敗而非默默通過
