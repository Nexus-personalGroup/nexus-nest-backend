---
name: "OPSX: Archive"
description: Archive a completed change in the experimental workflow
category: Workflow
tags: [workflow, archive, experimental]
---

Invoke the **`openspec-archive-change`** skill with the Skill tool, passing along whatever the user typed
after `/opsx:archive` — a change name (e.g. `/opsx:archive add-auth`); may be empty, in which case the skill prompts with the list of active changes.

---

This command is a thin entry point **on purpose**. It used to carry its own full copy of the
workflow, which drifted 71 lines away from the skill. The drift was not theoretical: after
`openspec new change` gained the mandatory `--schema spec-driven-custom` flag, the skill was
updated and this file was not, so `/opsx:archive` silently kept producing changes on the built-in
schema with none of the project's format rules.

The process lives in exactly one place: `.claude/skills/openspec-archive-change/SKILL.md`.
**Edit the skill, never this file.**
