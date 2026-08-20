---
name: "OPSX: Explore"
description: "Enter explore mode - think through ideas, investigate problems, clarify requirements"
category: Workflow
tags: [workflow, explore, experimental, thinking]
---

Invoke the **`openspec-explore`** skill with the Skill tool, passing along whatever the user typed
after `/opsx:explore` — whatever the user wants to think about — a vague idea, a specific problem, a change name, a comparison, or nothing at all.

---

This command is a thin entry point **on purpose**. It used to carry its own full copy of the
workflow, which drifted 143 lines away from the skill. The drift was not theoretical: after
`openspec new change` gained the mandatory `--schema spec-driven-custom` flag, the skill was
updated and this file was not, so `/opsx:explore` silently kept producing changes on the built-in
schema with none of the project's format rules.

The process lives in exactly one place: `.claude/skills/openspec-explore/SKILL.md`.
**Edit the skill, never this file.**
