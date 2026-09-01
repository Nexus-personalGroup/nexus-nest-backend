## ADDED Requirements

### Requirement: master spec 的 Purpose 必須寫完

系統 SHALL 確保 `openspec/specs/*/spec.md` 的 `## Purpose` 區塊非空，
且不含 `TBD`。

`openspec archive` **只合併 `## Requirements`**，Purpose 會被寫成
`TBD - created by archiving change X. Update Purpose after archive.` 留給人補。
那串字面上已經在提醒了，而它被忽略了 5 次——**提醒放在產出物裡卻沒有東西會讀它，
等於沒有提醒**。`openspec validate --specs --strict` 也不會抓（那是 CLI 的行為，
不在本專案控制範圍）。

判定 MUST 是「非空**且**不含 `TBD`」，MUST NOT 精確比對 archive 產生的那串字：
精確比對只擋得住原封不動的佔位字串，有人改成 `TBD - 待補` 就過關了，
而那正是最可能發生的「補一半」。代價是 Purpose 內文提到 `TBD` 會誤報——
可接受，Purpose 是在說「這個能力是什麼」，不該出現待辦標記。

#### Scenario: 封存新能力後沒補 Purpose

- **WHEN** `openspec archive` 建立了新的 master spec 而 Purpose 仍是佔位字串
- **THEN** 檢查失敗，訊息列出該 spec 並說明 archive 不會自動補 Purpose

#### Scenario: Purpose 補了一半

- **WHEN** Purpose 被改寫成其他含 `TBD` 的字串
- **THEN** 檢查仍然失敗

#### Scenario: 掃描範圍失效

- **WHEN** 讀不到任何 master spec
- **THEN** 檢查 MUST 失敗而非默默通過
