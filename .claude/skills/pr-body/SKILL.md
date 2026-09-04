---
name: pr-body
description: Fill in this repo's pull request template for the current branch. Use when the user asks for a PR description, pastes the PR template, or says "PR body" / "寫 PR". Reads .github/PULL_REQUEST_TEMPLATE.md and the branch's openspec change instead of asking the user to paste anything.
license: MIT
metadata:
  author: nexus
  version: "1.0"
---

# Fill the PR template for the current branch

**Never ask the user to paste the template.** It lives at
`.github/PULL_REQUEST_TEMPLATE.md` — read it. Read it every time rather than working
from memory; sections get added and reworded.

Output one fenced ` ```markdown ` block containing the filled template, ready to paste.
**Write it in Traditional Chinese** — it is a project artifact.

## Gather first, write second

Before writing a single section:

1. `git branch --show-current` and `git log <base>..HEAD --oneline` — what actually
   landed on this branch. The base is usually `develop`.
2. `git diff <base>...HEAD --stat` — the real shape of the change.
3. **The openspec change folder**, if there is one — active under
   `openspec/changes/<name>/`, or archived under `openspec/changes/archive/<date>-<name>/`
   if it was already archived. This is where the reasoning lives:
   - `proposal.md` → **Why** and **What Changes**
   - `design.md` → **Decisions** and **Risks / Trade-offs**
   - `tasks.md` → which verification steps actually ran, and any ⚠️ deviations recorded
     during implementation
4. `gh pr checks` if a PR already exists — but see the checkbox rule below.

If there is no openspec change, the reasoning has to come from the commits and the diff.
Say so plainly rather than inventing a rationale.

## Section by section

### 這個 PR 做了什麼

One or two sentences on **what problem this solves**, then the bullets.
Group bullets by sub-change when the PR does more than one thing — a flat list of
eight bullets is unreadable.

### 背景與取捨

**This is the section that carries the most value, and the easiest one to get wrong.**

⚠️ **Do not restate the proposal's Why.** The reader is a reviewer, not someone
deciding whether to do the work. They need **what else was considered and why it lost**
— that lives in `design.md` under `## Decisions`, not in the proposal.

Include:

- A link to the openspec change folder (archived path if already archived).
- The alternatives that were rejected, **with their reason**. A table works well when
  there are three or more.
- Anything the implementation did **differently from the proposal**, and why.
  `tasks.md` records these with ⚠️ — they are the most review-worthy lines in the PR.
- Trade-offs that were knowingly accepted, stated as trade-offs.

### 怎麼驗證

⚠️ **CI-covered checks do not belong here.** The template says so explicitly.
`typecheck` / `lint` / `test:cov` / `e2e` all run in CI — repeating them is noise that
trains reviewers to skip this section.

What belongs here:

- **Real-machine acceptance** that CI cannot run (containers, proxy behaviour,
  startup logs, anything needing `docker compose`).
- **Reverse verification** — which rule was broken on purpose, what went red, and
  **that it was the right rule** that went red.
- **Before/after contrasts that were actually constructible** — "this scenario was
  green before the change and red after" is worth far more than a list of commands.
  If the contrast was constructed, say what the numbers were on each side.

Give runnable commands with expected output. If a step needs a temporary edit
(e.g. flipping a compose flag), say so and say to revert it.

### 相依

Migration, new env vars, new npm scripts, API contract changes, deploy ordering, other
PRs that must merge first. **Write 無 explicitly when there is none** — a blank section
reads as "not checked".

Also flag **behaviour changes that will surprise someone after merge**, even when
nothing is strictly required of them.

### 截圖

`N/A（無 UI 改動）` unless `apps/web/` changed.

## The checkboxes

Tick only what you **actually ran and saw pass**, and say so with numbers where they
exist (`守則 231`, `417/417`).

⚠️ **An unticked box MUST say why.** There are three different reasons a box stays
empty, and a bare empty box is indistinguishable from "forgot to check":

| Why it's empty | Write |
| --- | --- |
| Doesn't apply to this PR | `（**本次未動 controller / 路由**，只改測試與文件）` |
| Not done yet, deliberately | `（合併後補 \`openspec archive <name>\`）` |
| Ran and failed | Say that, and say what you're doing about it |

Never tick a box because it "would have passed" — the e2e box in particular is easy to
tick out of habit on a PR that never needed e2e. **Ticking it claims a run that did not
happen.**

⚠️ **Do not tick the openspec archive box if the change is not archived yet.**
Leave it unticked and note that it will be archived after merge — that matches this
project's rhythm, where archiving happens once the user confirms the merge.

If a check failed and was re-run, mention it if the failure was a known flake — being
quiet about a red run and then ticking the box is the thing this section exists to
prevent.

## What not to do

- **Do not run `gh pr create` or `gh pr edit`.** Output the markdown; the user posts it.
- **Do not invent verification steps you did not run.**
- **Do not pad.** If a section is genuinely empty, `無` is the correct answer.
