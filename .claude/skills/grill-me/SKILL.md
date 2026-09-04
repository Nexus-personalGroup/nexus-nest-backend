---
name: grill-me
description: Interview the user relentlessly about a plan or design until every branch of the decision tree is resolved. Use when the user says "grill me", wants to stress-test a plan, or wants requirements pinned down before opening an openspec change.
license: MIT
compatibility: Adapted from the public grill-me skill (github.com/mattpocock/skills, robmitt/grill-me-skill), with this project's question bank and output contract added.
metadata:
  author: nexus
  version: "2.0"
---

# Resolve every branch of the decision tree

Interview the user about their plan or design until **every branch has an answer**.
When decisions depend on each other, resolve the upstream one first.

**The goal is not to defeat the user — it is to let them discover what they haven't
thought through.**

`superpowers:brainstorming` is collaborative: grow the idea together.
This skill is adversarial: assume the plan has a hole, then go find it.
They chain well, but don't interleave them (one diverges, the other probes).

⚠️ **Ask the questions in Traditional Chinese.** This file is English because it is
an instruction to the model; the conversation follows the project's language rule.

## How to ask

**Use the `AskUserQuestion` tool for every question.** Never ask in plain prose —
the multiple-choice popup lets the user answer fast or type their own.

**One question at a time.** Wait for the answer before the next one.

**Give 2–4 concrete options** representing the realistic directions.
Generic `Yes` / `No` options are useless unless the question is genuinely binary.
**Put your recommendation first and mark it `（推薦）`** — the user always has "Other".

**Answer it yourself if you can.** This is the most important rule:
if a question could be answered by reading the code, the schema, or an existing spec,
**go read it — do not ask**. Spending a turn on "what are your permission codes called"
is offloading work onto the user, not interrogating them.

## Flow

1. After an answer, **acknowledge the decision in one or two sentences**, then ask the
   next question immediately. No long restatements.
2. Question answerable by exploration → explore, don't ask.
3. Continue until all branches are resolved.
4. Finish with a decision summary (format in the last section).

⚠️ **Write nothing while grilling.** No specs, no file edits, no implementation
outlines. Implementing while asking means the questions are decoration on decisions
already made.

## Question bank

Every entry below maps to a shape this project has actually hit.
Generic questions get generic answers, so prefer these — but **translate each one into
the specifics of this plan**. "What is this feature's default flag value" is useless;
"if account lock defaults to off, is this list page permanently empty" is not.

### Scope

- **Is there a second half that gets left behind?** This project's most common failure
  is not a bug — it is **half-done with nothing to remind anyone**: nginx landed but the
  old ports stayed open; the permission tree got grouped but the labels stayed as English
  codes; specs were archived with `TBD` still in Purpose.
- **What is the smallest version that works, and why not just that?**
  "Don't over-engineer" is a hard rule here. If the user can't describe something
  smaller, the scope usually hasn't converged yet.
- **Does this already exist?** (Answer this one yourself — don't ask.)
  Check `apps/api/src/`, `apps/web/src/`, `packages/api-client/src/` for an existing
  helper / port / hook doing the same thing.

### Protection and flags

- **Is what you're protecting larger than what would actually break?**
  Masking the **entire** `apps/api/.env` to stop `REDIS_URL` from breaking the container
  cost every developer a version-controlled file edit to flip one flag (#39).
- **What is this feature's default flag value, and does it actually run under that default?**
  `APPLICATION_ACCOUNT_LOCK_ENABLED` defaults to `false`, and all three points in the
  login path sit behind it — so repeated failures lock nobody out, and the UI gives no
  hint of that.
- **How does someone recover from a bad configuration?** With the IP whitelist enabled
  and the list empty, the guard is fail-closed — so **the admin page that would let you
  add an entry is itself 403** (#41).

### Failure and signal

- **When this goes wrong, what turns red?** If the answer is "nothing", that is the
  finding. This project's silent failures: Redis unreachable **degrades quietly**,
  a wrong SMTP host only fails when mail is actually sent, and a wrong verification link
  **never fails at all** — that string leaves the system.
- **Who notices first, and how long after?** "A user reports it" is the worst answer,
  "CI goes red" is the best. Everything in between needs writing down.
- **Could CI be green while local is red, or the reverse?** The difference is almost
  always in a file that isn't version-controlled (that was #40's e2e reading the whole
  `.env`).

### Who owns the decision

- **Is this a technical decision or a product decision?** Confusing the two either
  stalls implementation or quietly makes a call that wasn't yours.
  Known product decisions here: whether group invites need consent, whether account lock
  defaults on, whether CI blocks merges.
- **What are you trading for what?** Every non-obvious decision has a cost.
  #39 traded reproducibility for day-to-day convenience — written down, it can be argued
  about later.

### Prerequisites and ordering

- **Is the real first step something else?** The dashboard snapshot's unbounded
  `COUNT(*)`: three fixes with different costs, and **the first step is adding
  observability, not adding an index** — otherwise it's a guess.
  Ask: what information is missing before this decision can be made?
- **Is this being attached to "the next change that touches X" again?**
  Lesson from #35: **"while we're in there" is not scheduling, it is indefinite
  deferral.** If it's worth doing, give it its own change.
- **Is anything it depends on still missing?** The frontend repo, an upstream package,
  another PR.

## When to stop

Stop when every branch is resolved. **There is no question limit** — grill-me is opt-in,
and stopping halfway is the same as not running it.

But tell "branches remain" apart from "going in circles":

- Two questions in a row surface no new constraint or scenario → the branches converged.
- The user says "we'll deal with that later" → that's a scope decision. Record it under
  unresolved and move on; don't push.
- The remaining unknowns need data or an external condition → those belong in
  `tasks/todo.md`, not in the proposal.

If it becomes clear the plan is **actually two separate things**, say so directly.
That's worth more than continuing to ask.

## Output

Finish with a summary that can be handed straight to `openspec-propose`.
**Write the summary in Traditional Chinese** — it feeds project artifacts.

```markdown
## 要做的事
（一兩句話，用使用者最後確認的範圍）

## 問出來的限制
- （每一條對應一個被解掉的分支）

## 刻意不做
- （範圍外的東西 + 為什麼，這會變成提案的 Non-Goals）

## 還沒解的
- （要靠資料或外部條件的，這些進 tasks/todo.md 不進提案）
```

⚠️ **Nothing may appear in the summary that the user did not say.**
The output is the user's decisions, not design you slipped in along the way —
that is the mirror image of what this skill exists to prevent.
