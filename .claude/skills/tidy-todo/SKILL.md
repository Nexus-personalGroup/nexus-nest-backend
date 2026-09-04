---
name: tidy-todo
description: Review tasks/todo.md as a whole and fix what the latest change made stale. Use after finishing or archiving an openspec change, or when the user says "todo 要整理" / "todo整體要整理". Not a rewrite — a checklist pass over every section.
license: MIT
metadata:
  author: nexus
  version: "1.0"
---

# Review the whole of tasks/todo.md, not the part you touched

The recurring failure this skill exists to fix: **only the section related to the change
gets updated**, and the rest of the file quietly goes stale — a PR count that is one
behind, a roadmap claiming the backlog is empty while three actionable items sit below
it, a counter that says 8 next to a table with 9 rows.

**This is a review pass, not a regeneration.**

## The hard rule

⚠️ **Delete status. Never delete judgment.**

`tasks/todo.md` is mostly **reasoning**: why reCAPTCHA isn't wired up yet, why the
four sharding changes were deliberately split, eleven occurrences of a flaky e2e failure
and what each one refuted. That reasoning is the most valuable content in the file and
it is **not reconstructible** — it exists nowhere else.

What may be removed or collapsed:

- Items that are done (mark `✅ …（#N 修）` with a one-line summary of *how*, don't just delete)
- "In progress" entries for changes that merged
- Numbers that are now wrong

What may **never** be removed while tidying:

- Why something is not being done
- Trade-offs that were weighed
- Hypotheses that were refuted, and what refuted them
- ⚠️ notes about known costs of a decision

If a section feels long, that is not a reason to cut it. Prune only when the user asks.

## The checklist

Walk **all** of these every time, even the ones the change didn't touch.

### 1. 進行中

**This section means in progress. Merged work leaves it entirely.**

- The change just finished → `（#N）已完成，待 commit`, with the two or three
  judgments that matter, not a file list. Not-yet-committed still counts as in progress.
- **A merged change is deleted from this section**, not reworded to "已合併". Its
  record lives in 索引 and in the 已走完 narrative — keeping a third copy here is
  exactly the duplication that makes the file go stale, and it makes "進行中" stop
  meaning what it says.
  ⚠️ Check with `git log --oneline` rather than memory; "the user said they merged it"
  and "it is merged" are different facts.
- Normally there is **one** entry. Two means two changes are genuinely open.
  Three or more means something was never closed out — say so.

### 2. 路線圖

- **Cross-check against 待辦.** If it says "可以直接動的只剩兩項" then exactly two
  actionable items must exist below. This sentence is wrong more often than any other
  line in the file.
- The "next up" pointer must name a change that is actually next.

### 3. 已走完：`<start> → <end>，N 支 PR`

Three things go stale here and they go stale **separately**:

- **`N 支 PR`** — bump it.
- **The end date** — bump it when the date rolled over.
- **The narrative paragraph below it** — it ends with "最後…"; that sentence describes
  the previous change. Append the new one and move "最後" along.

### 4. 待辦 subsections

- Finished items → `✅ **<原標題>**（#N 修）` + one or two lines on *how it was fixed*,
  **keeping the original reasoning underneath**.
- A subsection whose items are now all done → keep the section, add a header note saying
  why it's still there (usually: the judgments are still referenced elsewhere).
- New cross-change side effects discovered during the work → write them here now.

### 5. 技術債 / 已知缺口

- Same ✅ treatment.
- ⚠️ **Check whether the change invalidated a stated reason.** A debt entry saying
  "要先加觀測" is wrong once observability shipped — rewrite it to say what the next
  step is now.

### 6. 觀察中

The flaky-e2e entry keeps the same number in **three** places — the table rows,
the `計數 N` line, and the ⚠️ note at the bottom. **They drift.** Check all three.

- New occurrence → add a table row with *what it refuted*, not just the symptom.
- ⚠️ **Did this change refute an existing hypothesis?** If so, say so explicitly and
  mark the hypothesis dead. Leaving a disproven hypothesis in place is worse than
  having none — the next person will chase it.

### 7. 索引

Add the row: `| #N | MM-DD | \`<change-name>\` | 一句話 |`.
The sentence should say **what judgment the change encoded**, not what files it touched.

### 8. 幾個反覆出現的教訓

Only add here when a pattern has now happened **more than once**. A single occurrence
belongs in `tasks/lessons.md`, not here.

## Verify before claiming done

Numbers are the thing that goes wrong, so check them mechanically rather than by eye:

- PR count in the heading vs. rows in the 索引 table
- `計數 N` vs. rows in the flake table
- Roadmap's "可以直接動的 N 項" vs. actual unmarked actionable items

State what you changed section by section. If a section needed nothing, say that —
"looked at it, nothing stale" is a real result and tells the user the pass was complete.
