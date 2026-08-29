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

- **Never run `git commit` / `git push` on your own** unless explicitly asked. Provide the commands for the user to run manually.
- **Do not over-engineer**: implement only what's asked — no extra endpoints, migration scripts, debug APIs, or entity files. When in doubt, do less.
- **Output data directly**: when asked for data / JSON, print it straight to stdout. Do not give placeholder values, setup steps, or scripts unless explicitly asked.
- **Verify schema before modifying queries**: before assuming a field exists, check `apps/api/prisma/schema.prisma`.
- **Reuse before creating**: before writing anything new, search `apps/api/src/` (backend), `apps/web/src/` (frontend), and `packages/api-client/src/` (shared) for an existing helper / facade / port / adapter / hook.

---

## Hard Rules

> Scannable red-line list; complements the Critical Rules above.
>
> Each rule is tagged with **how it is enforced** — `型別` (compiler), `測試` (architecture
> test / e2e), `lint` (eslint), `hook` (agent hook), or `自律` (convention only, nothing
> catches it). The `自律` ones are where your attention actually matters.

- 🚫 **Never let a controller touch Prisma / a repository directly** — always go through `Facade → UseCase / Service → Port` (hexagonal layering). 〔**lint + 測試**〕
- 🚫 **Never hand-scaffold a feature module or misplace the front/back split** — the codebase has two API sides: 後台 `admin/` (`/api/admin/*`) and 前台 `front/` (`/api/front/*`). The **in-side 5 layers** (controller / facade / service / port-in / module) live under `<side>/`; **out-side** (persistence / port-out), **domain**, and cross-cutting (guard / filter / interceptor / decorator) are **shared — never under a side**. Scaffold new modules with `pnpm --filter @app/api gen:module <name> [--admin|--front]` (defaults to admin); front module classes get a `Front` prefix. The generator also injects the error code + message, writes swagger yaml stubs, registers them in `openapi.yaml`, and re-runs bundle/generate — **its output passes typecheck / lint / all guardrails with zero hand edits**. If you ever change a domain base class, shared constant, or layering rule, re-run the generator on a throwaway name and verify it still comes out green. Swagger/api-client is admin-only (`/api/admin/docs`); front has its own doc (`/api/front/docs`), see `openspec/project/backend-architecture.md`. 〔**測試**〕
- 🚫 **Never `throw new Error('...')`** — use a domain exception (a subclass of `DomainException` passing a `ResponseCodes` code + a semantic `kind`) or a NestJS `HttpException`. The filter maps `kind → HTTP status` automatically, so you do **not** touch `GlobalExceptionFilter` when adding an exception. Adding a code means editing **two** files: `shared/constants/response-codes.ts` and `shared/constants/response-messages.ts` — the message table is `satisfies Record<ResponseCode, …>`, so a missing message fails typecheck immediately. 〔**測試**〕
- 🚫 **Never inline a user-facing message inside an exception** — messages live only in `response-messages.ts`. Static messages take `super(code, kind)` (two args, the base looks it up); parameterised ones take `super(code, kind, ResponseMessages.X(arg))`. A constructor overload makes the parameterised case a **compile error** if you forget the message, and an architecture test rejects Chinese string literals under `domain/exception/`. 〔**型別 + 測試**〕
- 🚫 **Never validate domain input with `of()` on a DB-restore path** — value objects have two entry points: `of()` validates and throws `INVALID` (→ 400) for user input; `trusted()` skips validation for `reconstitute()`. Re-validating on restore reports data corruption as a client input error. 〔**自律**〕
- 🚫 **Never hand-write a DTO class** — request / response types are always inferred from a Zod schema via `z.infer`, validated with `ZodValidationPipe`. 〔**測試**〕
- 🚫 **Never set `"type": "module"` on the root or `apps/api` `package.json`** — stay on the NestJS CommonJS baseline; switching to ESM cascades into breaking nest CLI / ts-jest / decorator metadata (`apps/web` is the exception — it's Vite ESM by design). 〔**測試**〕
- 🚫 **Never skip env validation** — any new env var must be added to the `envSchema` in `apps/api/src/infrastructure/validate-env.ts` (production-mandatory ones also into `productionErrors`), or it fails silently as `undefined` at runtime. 〔**測試**〕
- 🚫 **Never let an Exception message leak sensitive info** — SQL / stack traces must not reach the client; unexpected errors always return 500 + a generic message (domain exceptions return only a safe message). 〔**自律**〕
- 🚫 **Never mock the database in e2e / integration tests** — run against a dedicated test database (`test/setup/setup-env.e2e.ts` overrides `DB_DATABASE` to a `*_test` DB — object-config Prisma, no `DATABASE_URL`). `globalSetup` must verify the target DB name ends in `_test` before migrating/resetting; run serially (`--runInBand`) since all specs share one test DB. 〔**測試**〕
- 🚫 **Never run `pnpm dev` on your own** (including per-`--filter`) — the dev server is started by the user for verification. 〔**自律**〕
- 🚫 **Never modify `.env`** — that's the user's DB / secret config; only edit `.env.example`. 〔**自律**〕

---

## Communication Style

- Default reply language is **Traditional Chinese**; switch to English only when the user does.
- When the user says 「不用」 or interrupts, stop immediately and keep replies brief.
- Before a change touching 3+ files, outline the plan (which files, what changes) and wait for confirmation.
- When a requirement is ambiguous, ask one key question rather than guessing the implementation.
- Match reply length to question complexity. Simple question → direct answer, no headers.

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

- **Never use Japanese** in any artifact (overrides the bilingual default in the global CLAUDE.md).
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

### Phase 1 — Explore & Design (new feature)

- Gather design context from available sources — MCP design files (Pencil, Figma, etc.), PNGs / screenshots in `openspec/assets/`, or referenced docs.
- Use `openspec-explore` (or `superpowers:brainstorming` — one question at a time, decisions via `AskUserQuestion`) as a thinking partner to clarify requirements.
- Write the approved design to `openspec/changes/<name>/design.md`.

### Phase 2 — Specify

- Use `openspec-propose` → generates `proposal.md`, `specs/`, `tasks.md` in the change folder.
- **Changes must be created with `--schema spec-driven-custom`.** The project's format rules live in `openspec/schemas/spec-driven-custom/` and reach you through `openspec instructions`; `openspec config` is global-scope only, so a missing flag silently falls back to the built-in schema and every rule below stops applying. `openspec-schema.spec.ts` fails if the flag or the schema goes missing.
- Capability names carry a mandatory prefix that dictates how the spec is written: `api-` (backend endpoint contract, admin by default), `api-front-`, `ui-`, `platform-`. Full table in `openspec/project/openspec-conventions.md`.
- API changes must define request / response specs in the change's `specs/` **before any controller code** — each endpoint requirement needs **Request**, **Success Response**, and **Failure Responses** with real JSON. Two things are easy to get wrong: returning `null` omits the `data` key entirely (not `"data": null`), and `204 No Content` carries no body at all. `openspec-spec-format.spec.ts` enforces this.
- For backend changes, `tasks.md` phases follow this order: Schema/Migration → Domain/Port → Exceptions/Filter → Services (TDD) → Out Adapter → Controller/DTO → Facade + Module → Swagger → Unit tests → E2E tests → Verification → Wrap-up.
- The user reviews and approves before any code is written.

### Phase 3 — Implement

- Use `openspec-apply` to work task by task.
- For service / use case implementation use `superpowers:test-driven-development` — spec first, then implementation; write unit tests per block (mock ports at the service layer).
- **Work in blocks**: split the change into blocks that each build / verify independently (mind chained dependencies — e.g. dropping a column hits service / seed, so bind them into the same block; never leave a non-compiling intermediate state). Each block: run the Pre-Change Checklist green → give one bulleted commit command (the user runs it) → move to the next block.
- Before marking a task done, use `superpowers:verification-before-completion` — never claim "done" without running the verification command.
- Create `smoke-test.md` in the change folder with curl commands for manually verifying new endpoints.

### Phase 4 — Complete

- Use `openspec-archive-change` to close the change — it merges the change's `specs/` into `openspec/specs/` (master specs) and moves the change folder to `openspec/changes/archive/<YYYY-MM-DD>-<name>/`.
- Move deferred items to `tasks/todo.md`; append new lessons to `tasks/lessons.md`.
- **Review follow-up**: from the branch review report, open a fix change (same propose → apply → archive), split by severity (🔴 blockers first → same-topic 🟡 → the rest 🟡 / 🟢 in a separate cleanup change).
- Debug at any phase with `superpowers:systematic-debugging` (find the root cause before fixing).

### Working Habits

- **Subagent strategy**: offload research, broad searches, or cross-file comparison to an Explore subagent to protect the main context.
- **Demand elegance**: before acting, ask "is there a more elegant / smaller way?"
- **Lessons format**: record immediately when corrected or after hitting a non-obvious pitfall. Short rules stay one-line bullets; anything needing more than three lines uses the three-part form (踩到什麼 / Why / How to apply) under a dated `###` heading. See the "撰寫格式" section at the top of `tasks/lessons.md`.

### Memory rules

**`tasks/todo.md`** — update in these four situations:

1. **Before implementation**: record the change name and goal you're starting (e.g. `[ ] implement add-role-management`).
2. **After implementation**: review todo.md, confirm all goals are met, move completed items to the "done" section.
3. **Cross-change side effect discovered**: write it immediately, don't wait until session end.
4. **Feature deferred due to external dependency**: record the reason and condition.

**`tasks/lessons.md`** — append after corrections OR after the user confirms a non-obvious approach worked. **Only real pitfalls belong here.** Three things do not: knowledge that is just restating official docs (delete), project conventions and architecture decisions (move to `openspec/project.md` — **move first, then delete**, never drop information), and rules already enforced by a guardrail (delete — if a machine catches it, nobody needs to remember it). Prune periodically rather than appending forever; an unpruned lessons file becomes noise nobody reads.

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
