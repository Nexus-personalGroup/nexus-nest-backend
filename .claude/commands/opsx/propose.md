---
name: "OPSX: Propose"
description: Propose a new change - create it and generate all artifacts in one step
category: Workflow
tags: [workflow, artifacts, experimental]
---

Invoke the **`openspec-propose`** skill with the Skill tool, passing along whatever the user typed
after `/opsx:propose` — a kebab-case change name, or a description of what the user wants to build.

---

This command is a thin entry point **on purpose**. It used to carry its own full copy of the
workflow, which drifted 27 lines away from the skill. The drift was not theoretical: after
`openspec new change` gained the mandatory `--schema spec-driven-custom` flag, the skill was
updated and this file was not, so `/opsx:propose` silently kept producing changes on the built-in
schema with none of the project's format rules.

The process lives in exactly one place: `.claude/skills/openspec-propose/SKILL.md`.
**Edit the skill, never this file.**
