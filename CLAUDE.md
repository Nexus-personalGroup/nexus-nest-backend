# CLAUDE.md

Behavior rules for Claude Code in this repo. **Architecture, tech stack, project structure, module conventions, `gen:module`, seed, and the full command reference all live in `openspec/project.md`** — do not duplicate them here. This file only governs Claude's behavior, workflow, Hard Rules, and common commands. If the architecture isn't clear before you start, read `openspec/project.md` first.

---

## Session Start Checklist

At the start of every new session:

1. Ensure `tasks/lessons.md` and `tasks/todo.md` exist. If missing, create each with a title line + a one-line subtitle.
2. Read `tasks/lessons.md` — known pitfalls accumulated from past corrections.
3. Read `tasks/todo.md` — pending cross-change items and deferred features.
4. Read `openspec/project.md` — project context, structure, tech stack, conventions.
5. If working on a feature: check `openspec/changes/` for any active (non-archived) change and read its `tasks.md`.

---

## Critical Rules

- **Do not over-engineer**: implement only what's asked — no extra endpoints, migration scripts, debug APIs, or entity files. When in doubt, do less.
- **Verify schema before modifying queries**: before assuming a field exists, check `apps/api/prisma/schema.prisma`.
- **Reuse before creating**: before writing anything new, search `apps/api/src/` (backend), `apps/web/src/` (frontend), and `packages/api-client/src/` (shared) for an existing helper / facade / port / adapter / hook.

---

## Hard Rules

Split by **how each rule is enforced**. The machine-enforced ones are one-liners on purpose — the test is what actually stops you, so more words here would not make them more obeyed, and the reasoning already lives in `openspec/project/`. **The self-discipline ones are where your attention actually matters**, and they carry their full reasoning because nothing else will catch them.

### Machine-enforced — violating these fails `pnpm test`

- 🚫 Never let a controller touch Prisma / a repository directly — go through `Facade → UseCase / Service → Port`. 〔lint + `layering.spec.ts`〕
- 🚫 Never hand-scaffold a feature module or misplace the front/back split — use `pnpm --filter @app/api gen:module <name> [--admin|--front]` (defaults to admin). Layout and generator output: `project/backend-architecture.md`, `project/backend-utilities.md`. **If you change a domain base class, shared constant, or layering rule, re-run the generator on a throwaway name and confirm it still comes out green.** 〔`side-isolation.spec.ts` + layering〕
- 🚫 Never `throw new Error('...')` — use a `DomainException` subclass or a NestJS `HttpException`; adding a code means editing both `response-codes.ts` and `response-messages.ts`. 〔`no-native-error.spec.ts`, typecheck〕
- 🚫 Never inline a user-facing message where it can reach a client — messages live only in `response-messages.ts` (`ResponseMessages` for `DomainException`, `HttpMessages` for framework `HttpException`s). Guardrail's two-criteria design: `project/testing.md`. 〔type + `no-inline-message.spec.ts`〕
- 🚫 Never hand-write a DTO class — infer from a Zod schema via `z.infer`, validated by `ZodValidationPipe`. 〔`dto-from-zod.spec.ts`〕
- 🚫 Never set `"type": "module"` on the root or `apps/api` `package.json` — stay on the NestJS CommonJS baseline (`apps/web` is Vite ESM by design). 〔`commonjs-baseline.spec.ts`〕
- 🚫 Never skip env validation — new vars go into `envSchema` in `apps/api/src/infrastructure/validate-env.ts` (production-mandatory ones also into `productionErrors`). 〔`env-schema.spec.ts`〕
- 🚫 Never mock the database in e2e / integration tests — they run against the dedicated `*_test` PostgreSQL DB (`pnpm docker:deps`; Redis is mocked). Setup, the `globalSetup` guard and `--runInBand`: `project/testing.md`. 〔`e2e-real-database.spec.ts`〕

### Self-discipline — nothing catches these

- 🚫 **Never validate domain input with `of()` on a DB-restore path.**

  Value objects have two entry points: `of()` validates and throws `INVALID` (→ 400) for user input; `trusted()` skips validation for `reconstitute()`. Re-validating on restore reports **data corruption as a client input error** — the user sees a 400 for a row that was already broken before they touched it, and the real problem stays invisible.

- 🚫 **Never let an exception message leak sensitive info** (SQL, stack traces, connection strings).

  The generic-message fallback is narrower than it looks: it only covers **unexpected errors**. Domain and framework exception messages reach the client as written, so anything you put in one is outward-facing. No test inspects message contents.

- 🚫 **Never run `pnpm dev` on your own** (including per-`--filter`).

  The dev server is started by the user for verification. Starting it yourself takes the port, produces output nobody is watching, and leaves a process running after the session ends.

- 🚫 **Never modify `.env`** — that's the user's DB / secret config; only edit `.env.example`.

---

## Documentation Languages (overrides)

This project has explicit per-file language rules:

| File / location               | Language                 |
| ----------------------------- | ------------------------ |
| `CLAUDE.md` (this file)       | **English**              |
| `README.md`                   | Traditional Chinese      |
| `openspec/project.md`         | Traditional Chinese      |
| `openspec/project/**/*.md`    | Traditional Chinese      |
| `openspec/changes/**/*.md`    | Traditional Chinese      |
| `openspec/specs/**/*.md`      | Traditional Chinese      |
| `openspec/schemas/**`         | Traditional Chinese（`##` 結構標題除外，見下） |
| `tasks/lessons.md`, `todo.md` | Traditional Chinese      |
| Code comments (all files)     | Traditional Chinese only |
| Frontend UI strings           | Traditional Chinese only |

- **Never use Japanese** in any artifact.
- **Never write code comments in English or bilingual** — Traditional Chinese only.
- **The `##` headings in openspec artifacts stay English** — `## Why`, `## What Changes`, `## Capabilities`, `## Impact`, `## Context`, `## Decisions`, `## ADDED Requirements`, `### Requirement:`, `#### Scenario:` and friends are parsed by the openspec CLI, and `## Capabilities` in particular is the contract between the proposal and specs phases. Translating them breaks parsing silently. Everything under those headings is Traditional Chinese.

---

## Code Style

- Every non-trivial function gets a Traditional-Chinese TSDoc comment:
  ```typescript
  /**
   * 依 ID 查詢使用者
   * @param id - 使用者 ID
   * @returns 使用者記錄或 null
   */
  ```
- Comments are **moderate**: explain _why_ (non-obvious logic, domain terms, workarounds), not _what_. No comments on self-explanatory code.
- Prefer arrow functions unless a named function is strictly required (hoisting, recursion).
- TypeScript: full `strict: true` from the shared `tsconfig.base.json`. Don't relax strictness in a sub-workspace without justification.

---

## AI Development Workflow

Three layers work together:

| Layer       | Tool                                 | Purpose                                                       |
| ----------- | ------------------------------------ | ------------------------------------------------------------ |
| **Memory**  | `tasks/todo.md` + `tasks/lessons.md` | Cross-session deferred items and lessons                     |
| **Spec**    | `openspec/changes/<name>/`           | Per-change proposal / design / specs / tasks                 |
| **Process** | openspec + selected superpowers      | Change management + TDD / verification / debugging discipline |

### How openspec and superpowers divide the work

**Core principle: openspec owns artifacts and state; superpowers owns thinking discipline.**

- **openspec** = the artifact / state machine — the change folder, proposal / design / specs / tasks, progress checkboxes, archive merge-back. It knows where you are, what artifact comes next, and what format it must take.
- **superpowers** = cognitive discipline — how to ask, how to debug, how to confirm done. **It produces no files and owns no state.**

**Rule 1 — superpowers never creates files.** Conclusions go back into openspec's locations: a brainstorming outcome goes to `changes/<name>/design.md`; a systematic-debugging root cause is routed by the table below. Never open a separate plan file or report file — superpowers will want to, and this rule is what stops it.

**Root-cause routing** — not "write every root cause into lessons", that is what bloats it:

| Root cause | Goes to | Accumulates? |
| --- | --- | --- |
| **A** Fixable inside the current change | a task in `tasks.md` (insert as `2b`) | ❌ leaves with the archive |
| **B** Can become a guardrail | an architecture test | ❌ the machine remembers it |
| **C** Will be hit again and nothing catches it | `tasks/lessons.md` | ✅ **the only accumulating one — highest bar** |
| **D** One-off (typo, environment, upstream already fixed) | nowhere | ❌ |

Most root causes are A / B / D. **Only C goes into `lessons.md`.**

**Rule 2 — which explore tool:**

| Situation | Use |
| --- | --- |
| **You don't know what to build** (requirement undefined, several options, needs a human decision) | `superpowers:brainstorming` — one question at a time, decisions via `AskUserQuestion` |
| **You know what to build, not how things look today** (which modules it touches, how they currently work) | `openspec-explore` — it runs inside the openspec context and knows what is in `specs/` |

**Rule 3 — superpowers skills are conditional, not default.** Even whitelisted skills fire only when their condition holds; do not run the whole set because one "might apply":

| Skill | Fires when | Does not fire |
| --- | --- | --- |
| `brainstorming` | requirement is vague or has several options | requirement is clear → go straight to propose |
| `test-driven-development` | service / use case / domain logic | CRUD scaffolding, config, docs |
| `verification-before-completion` | **unconditional** — before any "done" claim | never skipped |
| `systematic-debugging` | a bug **whose root cause is unclear** | obvious typo / type error → just fix it |
| `grill-me` *(local skill, not superpowers)* | the user asks for it, **or** the design converged with no option ever rejected, **or** the proposal asserts "X needs no change" without evidence | requirement is clear, single file, behaviour unchanged |

**Rule 4 — on conflict, the openspec schema wins.** The schema is per-project, is fed in by `openspec instructions` at the moment an artifact is generated, and has guardrail tests behind it; superpowers is global and injected wholesale by a SessionStart hook. When they disagree about format or splitting, follow the schema.

**Rule 5 — the *superpowers* whitelist is four skills** (skills under `.claude/skills/` are this repo's own and are governed by the table above, not by this rule): `brainstorming`, `test-driven-development`, `verification-before-completion`, `systematic-debugging`. **The SessionStart hook injects all 14 — nothing else is used.** Explicitly not used: `using-git-worktrees`, `finishing-a-development-branch`, `requesting-code-review`, `receiving-code-review`, `subagent-driven-development`, `dispatching-parallel-agents`, `writing-plans`, `executing-plans` — planning and execution go through openspec, review goes through `cr-zh`, branching goes through GitFlow.

**Rule 6 — requirements and bugs take different paths.**

- **Vague requirement → ask the user one key question.** Do not guess and implement.
- **Unclear bug → find the root cause yourself** (`systematic-debugging`). Do not push it back to the user, unless you cannot reproduce it — then ask for repro steps.

### Change lifecycle — the exact order

1. **Branch first** — cut from `develop`, before the change folder exists.

   **The branch is named after what it delivers (its PR title), not after a change.** A change is one commit — an independently revertable logical unit. A branch is one PR — an independently mergeable *delivery* unit. **One branch holding N changes is normal, not an exception.**

   ```
   N=1   the change is the whole delivery → the verb prefix becomes the type
         change add-role-management       → branch feat/role-management
         change refactor-switch-to-postgres → branch refactor/switch-to-postgres
   N>1   name the theme; type follows its dominant nature
         → feat/admin-moderation
   too big  split one theme across several PRs
         → feat/admin-moderation-1 / -2
   ```

   `add-` / `improve-` → `feat/`, `fix-` → `fix/`, `refactor-` → `refactor/`, `enforce-` / tooling / config → `chore/`, plus `perf/` and `docs/`.

   Branch names are always **noun phrases** — `feat/role-management`, never `feat/add-role-management`. The verb is already said by the type.

   **No placeholder branch names** (`1`, `2`, `3`). The theme is known before you start. Only genuine exploration justifies a temporary name, and it **must be renamed before the first push** — renaming after a push means `git push origin :old new` plus resetting upstream, and it breaks any open PR link.

2. **Create the change** — `openspec new change "<name>" --schema spec-driven-custom`, then design → proposal → specs → tasks. **The user approves before any code is written.**
3. **Mark it in progress** — record the change name and goal in `tasks/todo.md`.
4. **Implement** — block by block (see Phase 3). Each block passes the Pre-Change Checklist before the next one starts, but **no commit between blocks**.
5. **Archive** — `openspec-archive-change`.
6. **Write lessons** — only if a real pitfall was hit (route C above). Nothing hit, nothing written.
7. **Update todo** — tick the change off, move deferred items to the deferred section.
8. **Commit — one commit per change.** Implementation, archive, lessons, and todo all go into a single commit. Not one per block, not one per file.
9. **Push** — the user pushes.
10. **Merge** — PR into `develop`.

**Only step 8 produces a commit.** Blocks are units of verification, not units of commit — a block going green means "safe to continue", not "time to commit". Never run `git commit` / `git push` yourself.

### Phase 1 — Explore & Design (new feature)

- Gather design context from available sources — MCP design files (Pencil, Figma, etc.), PNGs / screenshots in `openspec/assets/`, or referenced docs.
- Use `openspec-explore` (or `superpowers:brainstorming` — one question at a time, decisions via `AskUserQuestion`) as a thinking partner to clarify requirements.
- **Optional adversarial pass — `grill-me`**, after the design takes shape and before `openspec-propose`. It is the mirror of brainstorming: brainstorming grows the idea, grill-me assumes it has a hole and goes looking. **Do not interleave the two** — one diverges, the other probes. It writes nothing; its output is a decision summary that feeds straight into propose.
- Write the approved design to `openspec/changes/<name>/design.md`.

### Phase 2 — Specify

- Use `openspec-propose` → generates `proposal.md`, `specs/`, `tasks.md` in the change folder.
- **Changes must be created with `--schema spec-driven-custom`.** The project's format rules live in `openspec/schemas/spec-driven-custom/` and reach you through `openspec instructions`; falling back to the built-in schema silently drops every rule below. Two things keep that from happening and **both must stay** — `openspec/config.yaml` pins the project default (it covers the case nothing scans: a human typing `openspec new change` in a terminal), and the flag is what `openspec-schema.spec.ts` can actually see and fail on. The config file fails silently when deleted or mis-set; the flag fails loudly. Note the `openspec config` **command** is global-scope only, but the config **file** is per-project — conflating the two is why the project default went unset for so long.
- **Everything about artifact *format* lives in `openspec/schemas/spec-driven-custom/schema.yaml`** and is fed to you by `openspec instructions` at the moment each artifact is generated — capability prefixes, the `api-*` request/response format, delta operations, the `tasks.md` phase order and block-splitting rule, the design writing requirements. **Do not restate them here or in `openspec/project/`**; read the schema. `openspec-spec-format.spec.ts` guards the spec side.
- The user reviews and approves before any code is written.

### Phase 3 — Implement

- Use `openspec-apply` to work task by task.
- For service / use case implementation use `superpowers:test-driven-development` — spec first, then implementation; write unit tests per block (mock ports at the service layer).
- **Work in blocks**: split the change into blocks that each build / verify independently (mind chained dependencies — e.g. dropping a column hits service / seed, so bind them into the same block; never leave a non-compiling intermediate state). Each block: run the Pre-Change Checklist green → move to the next block. **No commit between blocks** — blocks are units of verification, not units of commit (see the lifecycle above).
- Before marking a task done, use `superpowers:verification-before-completion` — never claim "done" without running the verification command.
- Create `smoke-test.md` in the change folder with curl commands for manually verifying new endpoints.

### Phase 4 — Complete

- Use `openspec-archive-change` to close the change — it merges the change's `specs/` into `openspec/specs/` (master specs) and moves the change folder to `openspec/changes/archive/<YYYY-MM-DD>-<name>/`.
- Move deferred items to `tasks/todo.md`; append new lessons to `tasks/lessons.md`.
- **Review follow-up**: from the branch review report, open a fix change (same propose → apply → archive), split by severity (🔴 blockers first → same-topic 🟡 → the rest 🟡 / 🟢 in a separate cleanup change).
- Debug at any phase with `superpowers:systematic-debugging` (find the root cause before fixing).

### Does a bug get its own change?

The test: **if this bug is not fixed, can the current change still claim to be done?**

| Situation | What to do |
| --- | --- |
| No change in progress (bug in production, user-reported, from a review report) | **Open a fix change** |
| In progress, and the bug is inside this change's scope (you just wrote it) | Fold it into the current change, inserted as `2b` in `tasks.md` |
| In progress, but the bug is unrelated to this change | **Open a separate fix change** — folding it in costs the current change its "independently revertable" property |

**Threshold**: if behaviour does not change (typo, comment, formatting), no change is opened — just fix and commit.

**How a fix change writes its spec** — this matters more than whether to open one:

| Nature of the bug | Spec handling |
| --- | --- |
| The spec was clear; the code just didn't do it | No spec change; add the test. `skip_specs: true` is acceptable |
| **The spec never covered this situation (most common)** | Add a `#### Scenario:` to the existing requirement — *that* is the real spec delta |

If the spec were complete and had matching tests, the bug usually would not exist — so **most bugs expose a gap in the spec, not an oversight in the implementation**. A fix change **adds a scenario by default**, so `openspec archive` merges it into the master spec and the same bug cannot come back. Fixing the code without adding the scenario skips that protection entirely.

### Working Habits

- **Lessons format**: record immediately when corrected or after hitting a non-obvious pitfall. Short rules stay one-line bullets; anything needing more than three lines uses the three-part form (踩到什麼 / Why / How to apply) under a dated `###` heading. See the "撰寫格式" section at the top of `tasks/lessons.md`.

### Memory rules

**`tasks/todo.md`** — update in these four situations:

1. **Before implementation**: record the change name and goal you're starting (e.g. `[ ] implement add-role-management`).
2. **After implementation**: review todo.md, confirm all goals are met, move completed items to the "done" section.
3. **Cross-change side effect discovered**: write it immediately, don't wait until session end.
4. **Feature deferred due to external dependency**: record the reason and condition.

**`tasks/lessons.md`** — append after corrections OR after the user confirms a non-obvious approach worked. **Only real pitfalls belong here** (route C in the root-cause table above). Three things do not: knowledge that is just restating official docs (delete), project conventions and architecture decisions (move to `openspec/project.md` — **move first, then delete**, never drop information), and rules already enforced by a guardrail (delete — if a machine catches it, nobody needs to remember it).

**Pruning trigger and criterion** — "prune periodically" with no trigger means it never happens:

- **Trigger**: check on every archive (same moment as `tidy-todo`).
- **The criterion is duplication, not entry count.** An entry earns its place if it is a specific pitfall that nothing else records. Delete only when the same rule already lives in `openspec/project/`, in this CLAUDE.md, or in another entry of the same file — and when it does, keep the canonical copy and leave a pointer rather than dropping the reasoning. A 2026-09-16 pass over 133 entries found exactly **4** genuine duplicates. **Never cut by headcount** — it destroys knowledge that exists nowhere else.
- **The per-session cost is real, but deletion is the wrong lever.** The Session Start Checklist reads this file every session. When it grows past what is worth loading wholesale, change *how* it is read — scan the `##` topic headings and open only the section relevant to the work at hand — instead of deleting entries that earn their place.

**Design docs** always live in `openspec/changes/<name>/design.md`.

---

## Pre-Change Checklist

After making changes, before suggesting a commit:

1. `pnpm typecheck` — fix all type errors across the three workspaces. If api typecheck reports "Property X does not exist on PrismaService", run `pnpm --filter @app/api db:generate` first.
2. `pnpm lint` — fix all lint warnings / errors.
3. `pnpm test` — unit tests **plus the architecture guardrails** (the `test` script chains both; the guardrail count lives in `guardrail-inventory.spec.ts`, not here — a hardcoded number here would silently go stale). If controllers / routes changed, run `pnpm --filter @app/api test:e2e` (runs against a real `*_test` PostgreSQL DB — start it with `pnpm docker:deps`; Redis is mocked). Before suggesting a commit, prefer `pnpm test:cov` — that is what CI runs, and it additionally enforces the coverage thresholds (api 70/60/70/70, web 75/75/60/75).
4. `pnpm build` — run when touching module wiring, path aliases, decorators, or build config. `nest build` / `vite build` catch path-alias resolution, decorator-metadata, and emit-stage errors that `tsc --noEmit` misses.
5. If swagger yaml changed: `pnpm --filter @app/api swagger:bundle` + `pnpm --filter @app/api-client generate` to keep frontend types in sync. Verify with `pnpm --filter @app/api swagger:check` — it regenerates into a temp dir and diffs, so it never touches the working tree. (Route-level drift is already caught by `pnpm test`; `swagger:check` covers content-level drift where the path set is unchanged.)

Once all pass, suggest a commit message (Traditional Chinese, conventional commits; body as bullets, one change per bullet). Do not run `git commit` yourself.

---

## Commands (top 5)

Package manager: **pnpm 11+**. Run from repo root.

```bash
pnpm install                                  # install all workspace deps
pnpm dev                                      # start apps/api + apps/web in parallel (user runs this; don't run it yourself)
pnpm typecheck && pnpm lint && pnpm test:cov  # the pre-commit chain (test:cov = tests + coverage thresholds + guardrails; CI runs this)
pnpm --filter @app/api test:arch              # guardrails only — ~0.3s, no DB（數量見其輸出）
pnpm --filter @app/api db:generate            # run after every pnpm install, before typecheck
pnpm --filter @app/api swagger:bundle && pnpm --filter @app/api-client generate   # after Swagger changes
```

**Full per-workspace command reference**: see `openspec/project/tooling.md` → 「完整指令參考」.

---

## Architecture & Conventions

`openspec/project.md` is the **index** — purpose, monorepo layout, tech stack, and a table pointing
into `openspec/project/`. Read the index first, then open only the file you need:

| File | Covers |
| --- | --- |
| `project/backend-architecture.md` | Hexagonal layout (`adapter` / `application` / `domain` / `infrastructure`), module naming, naming conventions, time handling, Swagger yaml conventions (inline data, never `$ref: SuccessResponse`) |
| `project/backend-runtime.md` | Auth flow, token storage, CORS, environment variables, RBAC, global middleware, API response format, feature flags, security settings |
| `project/backend-utilities.md` | Logging, masking, Zod, date helpers, file storage, seed, System Log, pagination, the `gen:module` generator |
| `project/frontend.md` | `apps/web` layout, shadcn integration, form / API conventions, api-client design (source-first, auto-unwrap of `{ success, data, timestamp }`) |
| `project/testing.md` | Unit / e2e / architecture-guardrail split, where rules live, how to add one, the exemption list, coverage thresholds |
| `project/openspec-conventions.md` | Capability naming prefixes, `api-*` request/response format, change naming, tasks.md block splitting |
| `project/tooling.md` | `.agents/hooks/*.sh` (logic is tool-agnostic; `.claude/settings.json` only registers it — edit the script, not the JSON; `hook-scripts.spec.ts` auto-checks new ones), containerised dev (single `compose.yml`; `pnpm docker:up` runs the whole stack) and its six non-obvious gotchas, `pnpm verify:ci`, CI job responsibilities and their local equivalents, full command reference |

Don't duplicate any of that here. When in doubt, read `openspec/project.md` first.
