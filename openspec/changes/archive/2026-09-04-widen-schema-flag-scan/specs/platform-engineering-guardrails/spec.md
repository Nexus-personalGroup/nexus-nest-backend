## MODIFIED Requirements

### Requirement: openspec 自訂 schema 的執行路徑檢查

系統 SHALL 確保專案的 openspec 格式規範真的會生效：自訂 schema 與四份模板存在、
`schema.yaml` 可解析且四個 artifact 齊全、建立 change 的指令一律帶
`--schema spec-driven-custom`、進行中的 change 皆使用該 schema、
且 `.claude/commands/opsx/*` 維持轉呼叫 skill 的薄殼。

`openspec config` 只支援 global scope，專案預設 schema 進不了版控——少帶旗標就會
靜默落回內建 schema，所有格式規範一條都不生效。

旗標檢查 MUST 涵蓋**所有現行的指示文件**——判準是「有沒有人會照著它做」，
而不是目錄長相。目前包含 `.claude/`、`openspec/`、`CLAUDE.md`、`README.md`。
**只掃其中一處就是這條守則自己要防的形狀**：建 change 的指令在多個地方各寫一次，
改了一份、其餘靜默留在內建 schema。

`openspec/changes/archive/` MUST 排除。封存的是當時的決策紀錄，
**今天的規則不該讓昨天的紀錄變紅**——那會逼人去改歷史，比漏一條檢查更糟。

檢查 MUST 斷言掃到的呼叫數量大於零，否則指令改名或流程改寫時規則會空轉。

#### Scenario: 建立指令漏帶旗標

- **WHEN** 任一份現行指示文件的 `openspec new change` 未帶 `--schema`
- **THEN** 檢查失敗並指出該檔案

#### Scenario: ⭐ 封存的 change 含未帶旗標的指令

- **WHEN** `openspec/changes/archive/` 底下的文件出現未帶旗標的 `openspec new change`
- **THEN** 檢查 MUST NOT 失敗——那是歷史紀錄，不是指示

#### Scenario: opsx 指令重新抄回完整流程

- **WHEN** 某支 opsx 指令檔超過 40 行或不再轉呼叫 skill
- **THEN** 檢查失敗——流程只能有一份真相
