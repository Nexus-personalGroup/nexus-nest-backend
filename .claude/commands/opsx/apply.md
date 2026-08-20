---
name: "OPSX: Apply"
description: Implement tasks from an OpenSpec change (Experimental)
category: Workflow
tags: [workflow, artifacts, experimental]
---

Invoke the **`openspec-apply-change`** skill with the Skill tool, passing along whatever the user typed
after `/opsx:apply` — a change name (e.g. `/opsx:apply add-auth`); may be empty, in which case the skill infers it from context or prompts.

---

This command is a thin entry point **on purpose**. It used to carry its own full copy of the
workflow, which drifted 20 lines away from the skill. The drift was not theoretical: after
`openspec new change` gained the mandatory `--schema spec-driven-custom` flag, the skill was
updated and this file was not, so `/opsx:apply` silently kept producing changes on the built-in
schema with none of the project's format rules.

The process lives in exactly one place: `.claude/skills/openspec-apply-change/SKILL.md`.
**Edit the skill, never this file.**
