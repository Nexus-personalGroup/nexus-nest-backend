## ADDED Requirements

### Requirement: 訊息的持久層存取必須只有一個入口

存取 `chatMessageRecord` 的程式碼 MUST 只出現在訊息的 repository，
其他位置 MUST 明示豁免並註明理由。

理由不是分層潔癖，是**內容遮蔽只寫在一處**：被撤回的訊息內容保留在資料庫供檢舉調查，
但一律不得外流。遮蔽發生在 repository 把資料列投影成對外物件的那一個函式裡，
因此多一個查詢入口就多一條繞過遮蔽的路徑——而它不會有徵兆：
測試若只驗歷史查詢，補齊那條照樣洩漏。

後台的檢舉調查之後會需要一條**看得到內容**的路徑。它 MUST 走豁免並註明
「僅限後台、需 RBAC 授權、且必須留稽核紀錄」，MUST NOT 放寬本規則。

#### Scenario: service 直接查詢訊息表

- **WHEN** application 層或其他 adapter 直接使用 `prisma.chatMessageRecord`
- **THEN** 守則失敗，訊息包含檔案與行號

#### Scenario: 豁免未註明理由

- **WHEN** 某位置列入豁免清單卻沒有理由
- **THEN** 守則失敗——豁免一旦失去理由就會逐漸長大

#### Scenario: 註解提及即被視為存取

- **WHEN** 檔案只在註解裡提到 `chatMessageRecord`
- **THEN** MUST NOT 判定為違規——比對前須去除註解
