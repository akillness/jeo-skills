# bmad — BMAD Core Workflow Router

> **bmad** is the repository's portable BMAD/BMM core router. It helps you choose project level, identify the current phase, select the next artifact, and hand runtime-specific or specialist depth to the right neighboring skill.

[![GitHub Releases](https://img.shields.io/badge/GitHub-Releases-blue)](https://github.com/akillness/oh-my-skills/releases)
[![Release Notes](https://img.shields.io/badge/release-notes-blue)](https://github.com/akillness/oh-my-skills/releases)
[![BMAD Deploy Version](https://img.shields.io/badge/BMAD-2.0.0-brightgreen)](../../.agent-skills/bmad/SKILL.md)

![Agent Skills Installer](../../AgentSkills.png)

---

## What is BMAD?

BMAD (Business-Method-Agile-Development) is a phase-based workflow that brings discipline to AI-assisted development. Instead of jumping straight to code, BMAD guides you through structured phases so nothing is missed.

```
Phase 1: Analysis       → Understand the problem space
Phase 2: Planning       → Define requirements & tech specs  
Phase 3: Solutioning    → Design the architecture
Phase 4: Implementation → Build, test, ship
```

---

## Quick Start (3 Steps)

Deploy target: use the repo release or install directly from `akillness/oh-my-skills`, then start from the core routing workflow.

**Step 1: Install the skill**

```bash
npx skills add https://github.com/akillness/oh-my-skills --skill bmad
```

**Step 2: Activate the skill**

```text
Use the bmad skill and remember it.
```

**Step 3: Ask for the current BMAD route**

```text
Use bmad. What phase are we in, and what artifact should we create next?
```

The modern `bmad` flow is level-first and artifact-first: it picks the likely BMAD phase, recommends one next artifact, and routes review/runtime detail to the correct neighboring skill.

## Codex 사용성

`bmad`는 코어 BMAD 라우터로 동작하며 특정 런타임에 묶이지 않습니다.  
Codex에서는 실행/오케스트레이션 세부를 `omx`로, Gemini·Antigravity 쪽은 `ohmg`로, Claude 런타임 세부는 `omc`로 넘기는 식으로 사용하는 것이 좋습니다.

권장 흐름:

```text
1) Codex: /prompts: architect/executor/... (or omx mode)
2) 필요한 단계별 산출물 생성 -> Codex가 파일만 제안
3) Claude-based BMAD 프레임으로 최종 검증
```

## 플랫폼 적용 체크

| 플랫폼 | 현재 지원 상태 | 운영 방법 |
|---|---|---|
| Gemini CLI | 직접 지원 | `bmad` 명령어 기반 |
| Claude Code | 직접 지원 | 스킬 설치 + `기억해` |
| OpenCode | 오케스트레이션 연동 | `omx`/`ohmg`류 브릿지 |
| Codex | 오케스트레이션 연동 | `omx`/`ohmg`류 브릿지 |

### 현재 스킬만으로 가능한가

- Gemini CLI/Claude Code: **가능**
- OpenCode/Codex: **가능(오케스트레이션 경유)**

---

## Detailed Documentation

| Document | Description |
|----------|-------------|
| [Installation & Setup](./installation.md) | Full install guide, skill activation, `기억해` pattern |
| [Workflow Guide](./workflow.md) | All 4 phases, commands, project levels (0–4) |
| [Configuration Reference](./configuration.md) | Config files, status tracking, variable substitution |
| [Practical Examples](./examples.md) | Real workflows for bug fix → enterprise project |

---

## Phase Overview

| Phase | Purpose | Required? |
|-------|---------|-----------|
| **1: Analysis** | Market research, product vision, brainstorming | Optional (recommended for Level 2+) |
| **2: Planning** | PRD or Tech Spec — defines what to build | **Always required** |
| **3: Solutioning** | Architecture design | Required for Level 2+ |
| **4: Implementation** | Sprint planning, stories, dev, code review | **Always required** |

---

## Project Levels

BMAD automatically adapts to your project scope:

| Level | Size | Examples | Duration |
|-------|------|---------|----------|
| 0 | Single change | Bug fix, config tweak | Hours |
| 1 | Small feature | New API endpoint, profile page | 1–5 days |
| 2 | Feature set | Auth system, payment flow | 1–3 weeks |
| 3 | Integration | Multi-tenant, analytics platform | 3–8 weeks |
| 4 | Enterprise | Platform migration, major overhaul | 2+ months |

---

## Key Commands

```text
/workflow-init      # Initialize BMAD in current project
/workflow-status    # Check current phase and progress
/product-brief      # Phase 1: Create product vision
/prd                # Phase 2: Product Requirements Document
/tech-spec          # Phase 2: Technical Specification
/architecture       # Phase 3: System architecture design
/sprint-planning    # Phase 4: Break into sprints & stories
/dev-story          # Phase 4: Implement a specific story
```

---

## With Other Harnesses

bmad works alongside other harnesses. Activate with `기억해` to persist the config:

```text
bmad 스킬을 설정하고 사용해줘. 기억해.   # Claude Code
omx 스킬을 설정하고 사용해줘. 기억해.    # Codex CLI
ohmg 스킬을 설정하고 사용해줘. 기억해.   # Gemini-CLI
```

---

## plannotator Integration

Review each phase's key deliverable with **plannotator** before transitioning to the next phase. Approved documents auto-save to your enabled destination (Obsidian or Bear).

### Phase Gate Workflow

```
Phase document created (PRD, Architecture, etc.)
       ↓
bash scripts/phase-gate-review.sh <doc-file> "<title>"
       ↓
plannotator UI opens → Annotate → Approve or Request Changes
       ↓
[Approved] → Saved (Obsidian/Bear) + proceed to next phase
[Changes]  → Agent revises → re-review
```

### Usage

```bash
# Review PRD before moving to Solutioning (Phase 3)
bash scripts/phase-gate-review.sh docs/prd-myapp-2026-02-22.md "PRD Review: myapp"

# Review Architecture before starting Implementation (Phase 4)
bash scripts/phase-gate-review.sh docs/architecture-myapp-2026-02-22.md "Architecture Review: myapp"
```

Or trigger from within your AI session after any phase document is created:

```text
plan — review the PRD before we proceed to Phase 3
```

### Save Destination (Obsidian or Bear)

Approved plans are saved with BMAD-specific tags:

```yaml
tags: [bmad, phase-2, prd, myapp]
```

Set the destination in plannotator UI (Settings → Saving):
- Obsidian Integration
- Bear Notes

See [plannotator docs](../plannotator/README.md) for setup and callback troubleshooting.

---

→ [Back to skills-template README](../../README.md)
