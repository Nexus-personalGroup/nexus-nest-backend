---
name: tidy-todo
description: Review tasks/todo.md as a whole and fix what the latest change made stale. Use after finishing or archiving an openspec change, or when the user says "todo 要整理". Not a rewrite — a checklist pass over every section.
license: MIT
metadata:
  author: nexus
  version: "2.0"
---

# Review the whole of tasks/todo.md, not the part you touched

The recurring failure this skill exists to fix: **only the section related to the change
gets updated**, and the rest of the file quietly goes stale — a change still listed as
待收尾 that was archived last week, a deferred item whose blocking condition already
arrived, a count in a heading that no longer matches reality.

**This is a review pass, not a regeneration.**

## The file's shape

`tasks/todo.md` has **eight fixed `##` sections, in this order**. Do not add a ninth;
if something does not fit, it belongs in one of these or not in this file at all.
（本專案與 atago / kgie / hexagonal / nexus / times 五個 repo 使用同一套章節，2026-09-21 統一。）

| 章節 | 放什麼 |
| --- | --- |
| `## 撰寫格式` | 本檔自己的格式規則。改格式時先改這裡 |
| `## 待辦` | 還沒開始、可動工的新工作 |
| `## 技術債` | 既有實作的欠債，**現在就在付成本** |
| `## 待收尾的 change` | 已封存、但仍有前端配合或 smoke test 未完 |
| `## 延後項目` | 刻意延後，**要寫解除條件** |
| `## 已決議不做` | 評估過決定不做，**要寫理由與重提條件** |
| `## 注意事項` | 長期提醒、觀察中的現象、需人工處理的操作 |
| `## 已完成` | 完成的項目 |

兩組最容易混的：

- **`待辦` vs `技術債`**：技術債是既有實作欠下的、現在就在付成本；待辦是還沒做的新東西。
- **`延後項目` vs `已決議不做`**：前者「之後要做，等某個條件」；後者「評估過決定不做」。
  混在一起的結果是同一個提案每隔一陣子被重新評估一次。

## The hard rule

⚠️ **Delete status. Never delete judgment.**

檔裡多數內容是**判斷**——為什麼某條守則不做、某個欄位不能手改、某個延後是可接受的。
那些不可重建，除了這裡沒有第二份。

可以移除或收攏的：不符事實的狀態字、已完成的項目（整條搬到「已完成」）、已經不對的數字。

**整理時絕不可移除**：為什麼某件事不做、被權衡過的取捨、
⚠️ 關於某個決定已知代價的註記、判準。

> 2026-09-21 章節重組時就踩過一次：把「進行中」整節搬走時，
> 連同「保留在此是因為底下的判斷仍被後續 change 引用」那句一起丟了。
> 那是判斷不是狀態。核對腳本抓到才補回。

## The checklist

每次都走完**全部八節**，包含這次沒碰到的。

### 1. 待辦

- 這次 change 有沒有把某條待辦做掉？做掉的整條搬到「已完成」。
- 新發現的可動工項目**現在就寫**，不要等 session 結束。

### 2. 技術債

- ⚠️ **數字會漂。** 標題或內文裡的份數、支數，每次有人修過就不對了。
  核對方式：`ls apps/api/test/architecture/*.spec.ts | wc -l`。
- **這次 change 有沒有讓某條技術債的理由失效？**
- 某條已經被測試擋住了嗎？是的話從這裡移除——**機器記得的東西不需要人記**。

### 3. 待收尾的 change

- ⚠️ **逐一核對，用指令不是憑印象**：

  ```bash
  ls openspec/changes | grep -v archive
  ls openspec/changes/archive | tail -5
  ```

- 已封存**且底下沒有未完項目**的，整條搬到「已完成」。
- 仍有前端配合或 smoke test 未完的留著，但確認那些項目還沒被做掉。

### 4. 延後項目

- 最容易被遺忘的一節，沒人會主動去讀標題寫著「延後」的段落。
- **逐條問一次：當初延後的條件到了嗎？** 到了就移出來，沒到就確認理由還成立。
- 沒寫解除條件的，補上——沒有條件的延後等於無限期擱置。

### 5. 已決議不做

- ⚠️ **這一節的失效方向跟別節相反**：別節是條目過期，這裡是**理由死了條目還活著**。
- 逐條問：**這個理由現在還成立嗎？** 例如「做不到零假陽性」在技術到位之後就不成立了。
  不成立就改寫成下一步，或移到「待辦」——不要留著死理由，
  因為這一節存在的目的就是沒人會再去檢查它。
- 這次 change 產生的新「看過了，決定不做」結論**現在就寫**，
  沒寫下來的話兩個月後會再評估一次。

### 6. 注意事項

- 這節是長期提醒，不該長。每條都問：它還成立嗎？已經有測試或 hook 擋住了嗎？
- 間歇性失敗的條目要記**它又出現了幾次、每次推翻了什麼假設**，不是只記症狀。

### 7. 已完成

- 只用單行格式，**不要出現第二種寫法**，也不要分「較早 / 最近」之類的子區塊。
- 記的是**這次 change 定下了什麼判斷**，不是動了哪些檔案。

### 8. 撰寫格式

- 只有在真的改了格式時才動。改了就要同步本 skill。

## Verify before claiming done

數字與狀態最常出錯，用機械方式核對而不是用眼睛：

```bash
# [x] 不得出現在「已完成」以外的章節
awk '/^## /{s=$0} /^- \[x\]/{if(s!="## 已完成") print "✗ "s": "$0}' tasks/todo.md

# 章節必須剛好是那八個、順序不變
grep '^## ' tasks/todo.md
```

「索引」那張 PR 表要對 `git log --oneline`；間歇性失敗的次數要對實際發生紀錄，不要憑印象加一。

逐節說明你改了什麼。某節不需要動就說「看過了，沒有過期的」——
那是真實結果，代表這次 pass 是完整的。
