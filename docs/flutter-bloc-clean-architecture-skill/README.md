# flutter-bloc-clean-architecture-skill — Flutter BLoC + Clean Architecture

> Agentic AI skill for Flutter that enforces BLoC state management, clean architecture layering, and consistent design-system rules.

← [Back to README](../../README.md)

---

## What it provides

- Opinionated `SKILL.md` guidance for production-style Flutter architecture
- Feature and shared-layer examples (`examples/`)
- Clear data flow contract:

```text
UI → BLoC → Repository → Datasource → Backend
```

## Install

```bash
# Direct from source repo
npx skills add https://github.com/abdelhakrazi/flutter-bloc-clean-architecture-skill --skill flutter-bloc-development

# From oh-my-skills mirror docs
npx skills add https://github.com/akillness/oh-my-skills --skill flutter-bloc-clean-architecture-skill
```

## When to use

- You need a stricter Flutter layering contract for agent-generated code.
- You want to prevent business logic in widgets and keep UI/state/data boundaries explicit.
- You need a template for BLoC + Clean Architecture onboarding in team workflows.

## Source

- GitHub: https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill
- License: Apache-2.0
- Last checked (hourly survey): 2026-04-27
