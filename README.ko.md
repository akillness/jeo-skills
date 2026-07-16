# Agent Skills

<div align="center">

[![Skills](https://img.shields.io/badge/Skills-161-blue?style=for-the-badge)](https://github.com/akillness/jeo-skills)

[![Platform](https://img.shields.io/badge/Platform-Claude%20%7C%20Gemini%20%7C%20Codex%20%7C%20OpenCode%20%7C%20jeopi-orange?style=for-the-badge)](https://github.com/akillness/jeo-skills)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![BMAD](https://img.shields.io/badge/BMAD-1.2.0-purple?style=for-the-badge)](docs/bmad/README.md)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-orange?style=for-the-badge&logo=buy-me-a-coffee)](https://www.buymeacoffee.com/akillness3q)

**161개 로컬 스킬 폴더 · 설치 가능 스킬 161개 · TOON 포맷 · 멀티플랫폼**


[빠른 시작](#-빠른-시작) · [스킬 목록](#-스킬-목록) · [설치](#-설치) · [English](README.md)

</div>

---

## 💡 Agent Skills란?

Claude, Gemini, Codex, Cursor, OpenCode, [jeopi](https://github.com/akillness/jeopi)를 위한 161개 스킬 컬렉션 — 스펙 우선, 멀티 에이전트, 크로스 플랫폼.


## 🎮 Jeo 에이전트와 전설의 장비 세트

`jeo-skills`는 `@../jeo-code` 스펙 우선 Socratic AI 코딩 에이전트인 **Jeo**(`jeo`)의 전설적인 장비 세트 역할을 합니다. 각 핵심 스킬은 복잡한 코드베이스를 안전하고 효율적으로 정복할 수 있도록 Jeo에게 강력한 도구를 장착해 줍니다.

| 장비명 | 아이콘 | 핵심 스킬 / 훅 | Jeo를 위한 역할 |
| :--- | :--- | :--- | :--- |
| **현자의 로브 (Robe of Clarity)** | <img src="assets/jeo-robe.gif" width="64" height="64"><br>로브 | [`ooo`](.agent-skills/ooo/SKILL.md) / `jeo deep-interview` | **Socratic Ambiguity Gate**: Socratic 질문 루프를 통해 코딩 전에 요구사항을 완벽히 결정합니다. |
| **철벽의 갑옷 (Armor of Lock)** | <img src="assets/jeo-armor.gif" width="64" height="64"><br>갑옷 | [`ooo`](.agent-skills/ooo/SKILL.md) / `MutationGuard` | **Secure Codebase Mutation Guard**: 인터뷰 진행 중에는 코드 수정을 철저히 차단하여 안전을 보장합니다. |
| **신속의 장화 (Boots of Swiftness)** | <img src="assets/jeo-shoes.gif" width="64" height="64"><br>신발 | [`cli-anything`](.agent-skills/cli-anything/SKILL.md) / `jeo team` | **Bounded Executor**: 에이전트 전용 CLI 하네스를 통해 실제 소프트웨어를 신속하고 정확하게 구동합니다. |
| **설계의 지팡이 (Staff of Planning)** | <img src="assets/jeo-staff.gif" width="64" height="64"><br>지팡이 | [`spec-kit`](.agent-skills/spec-kit/SKILL.md) / `jeo ralplan` | **Critiqued Planning Blueprint**: 동결된 seed로부터 아키텍처 방향성과 세부 구현 계획을 수립합니다. |
| **검증의 양탄자 (Carpet of Verification)** | <img src="assets/jeo-carpet.gif" width="64" height="64"><br>양탄자 | [`ooo`](.agent-skills/ooo/SKILL.md) / `jeo ultragoal` | **Durable Checkpoint Verification**: 코드베이스 위를 날아다니며 `--json` 결과를 분석해 완벽한 구현을 검증합니다. |

*위 애니메이션 아이템들은 `god-tibo-imagen`(Codex ChatGPT 백엔드)을 이용해 이미지를 생성하고 `PIL`로 애니메이션을 합성하여 제작되었습니다.*

---

## 🏗 워크플로우 및 아키텍처

<img src="assets/workflow.svg" alt="jeo-skills Workflow & Architecture" width="100%">


---

## 🚀 빠른 시작

> **사전 준비**: `npx skills add` 명령을 실행하려면 먼저 `skills` CLI가 필요합니다.
>
> ```bash
> npm install -g skills
> ```

```bash
# LLM 에이전트에게 전달 — 읽고 자동으로 설치를 진행합니다
curl -s https://raw.githubusercontent.com/akillness/jeo-skills/main/setup-all-skills-prompt.md
```

| 플랫폼 | 첫 번째 명령 |
|--------|------------|
| Claude Code | `ooo interview "작업"` 또는 `/team "작업"` |
| Gemini CLI | `bmad "작업"` 또는 `ooo interview "작업"` |
| Codex CLI | `bmad "작업"` 또는 `ooo interview "작업"` |
| OpenCode | `bmad "작업"` 또는 `ooo interview "작업"` |

---


## 📦 설치

> **크로스 플랫폼**: macOS, Linux, Windows(Git Bash / WSL2) 모두 지원합니다. LLM 설치 프롬프트가 OS를 자동 감지하여 적합한 패키지 매니저(`brew` / `snap` / `winget`)와 경로(`$HOME` / `$USERPROFILE` / `$XDG_DATA_HOME`)를 선택합니다.

### ✨ 권장: LLM 위임 설치 (프롬프트 하나로 전 플랫폼 자동 처리)

설치 프롬프트를 사용 중인 코딩 에이전트(Claude Code, Codex, Gemini CLI, …)에 그대로 건네세요. 에이전트가 가이드를 읽고 OS를 감지해 `skills` CLI를 설치하고, 모든 스킬을 에이전트별 올바른 경로에 추가하며, MCP/셸 도구까지 등록합니다 — 수동 단계가 없습니다.

```bash
# 위임 가이드를 가져와 에이전트에게 전달
curl -s https://raw.githubusercontent.com/akillness/jeo-skills/main/setup-all-skills-prompt.md
```

또는 에이전트 채팅창에 URL을 그대로 붙여넣으세요:

> `https://raw.githubusercontent.com/akillness/jeo-skills/main/setup-all-skills-prompt.md` 를 전부 읽고 그대로 따라 jeo-skills를 설치해줘.

에이전트는 기본적으로 **전체 설치(full install)** 를 수행하며("core only" 또는 "minimal"이라고 하면 범위를 좁힙니다) 다음을 처리합니다:

- macOS / Linux / Windows를 감지해 `brew` / `snap` / `winget`과 알맞은 설치 경로 선택,
- `skills` CLI 설치 및 올바른 `-a` 에이전트 타게팅으로 스킬 추가(플랫폼 스킬 중복 노출 방지),
- MCP 도구(`ooo`, `semble`), 셸 도구(`rtk`), `oh-my-claudecode` 플러그인 등록,
- **기존 스킬 보존** — 추가/갱신만 하고 절대 삭제하지 않음.

---

### 수동 설치 (고급 / CI / 에이전트 없는 환경)

루프에 에이전트가 없는 스크립트·CI 환경에서는 단계를 직접 실행하세요.

#### 0단계: `skills` CLI 설치

```bash
npm install -g skills
skills --version
```

#### 범위와 경로

Vercel `skills` CLI는 GitHub 축약명, 전체 Git URL, 저장소 내부 특정 스킬 경로, 로컬 폴더를 모두 설치 소스로 받을 수 있습니다.

```bash
# 프로젝트 설치: 현재 저장소의 에이전트 스킬 폴더에 설치
npx skills add https://github.com/akillness/jeo-skills --skill deepinit --skill deep-dive

# 글로벌 설치: 해당 에이전트에서 모든 프로젝트에 사용
npx skills add -g https://github.com/akillness/jeo-skills --skill deepinit --skill deep-dive

# 특정 에이전트 대상으로 설치
npx skills add -g https://github.com/akillness/jeo-skills --skill deepinit --skill deep-dive -a claude-code -a codex -y
```

| OS / 셸 | 글로벌 예시 | 프로젝트 예시 |
|---------|-------------|---------------|
| macOS / Linux | `$HOME/.claude/skills/`, `$HOME/.codex/skills/`, `$HOME/.gemini/skills/`, `$HOME/.config/opencode/skills/`, `$HOME/.agents/skills/`, `$HOME/.jeopi/agent/skills/`, `$HOME/.jeo/agent/skills/` | `.claude/skills/`, `.agents/skills/`, `.jeopi/skills/`, `.jeo/skills/` |
| Windows PowerShell | `$env:USERPROFILE\.claude\skills\`, `$env:USERPROFILE\.codex\skills\`, `$env:USERPROFILE\.gemini\skills\`, `$env:APPDATA\opencode\skills\`, `$env:USERPROFILE\.agents\skills\`, `$env:USERPROFILE\.jeopi\agent\skills\`, `$env:USERPROFILE\.jeo\agent\skills\` | `.claude\skills\`, `.agents\skills\`, `.jeopi\skills\`, `.jeo\skills\` |
| Windows Git Bash / WSL2 | `$HOME/.claude/skills/`, `$HOME/.codex/skills/`, `$HOME/.gemini/skills/`, `$HOME/.config/opencode/skills/`, `$HOME/.agents/skills/`, `$HOME/.jeopi/agent/skills/`, `$HOME/.jeo/agent/skills/` | `.claude/skills/`, `.agents/skills/`, `.jeopi/skills/`, `.jeo/skills/` |

프로젝트 범위가 기본값이며 팀과 공유해야 하는 스킬은 커밋합니다. 글로벌 범위는 `-g`를 붙이며 개인 기본값에 적합합니다. `-a`로 에이전트별 경로를 고르고, 이식 가능한 공통 계층은 `.agents/skills/`입니다.

#### 플랫폼별 선택

```bash
# Claude Code
npx skills add https://github.com/akillness/jeo-skills \
  --skill omc --skill plannotator --skill agentation \
  --skill ooo --skill vibe-kanban

# Gemini CLI
npx skills add https://github.com/akillness/jeo-skills \
  --skill ohmg --skill ooo --skill vibe-kanban
antigravity extensions install https://github.com/akillness/jeo-skills

# Codex CLI
npx skills add https://github.com/akillness/jeo-skills \
  --skill omx --skill ooo

# jeopi — `-a` 지정 불필요: jeopi는 ~/.agents/skills 와
# .claude/.codex/.config/opencode 스킬 디렉터리를 네이티브로 자동 발견하므로 글로벌 설치만으로 충분합니다.
npx skills add -g https://github.com/akillness/jeo-skills \
  --skill deep-research --skill god-tibo-imagen --skill perfectpixel
# jeopi/jeo 전용 고정 설치(선택): ~/.jeopi/agent/skills/<skill> (글로벌) 또는 .jeopi/skills/<skill> (프로젝트) [.jeo도 동일]
```

#### 핵심 도구 설정 (전 플랫폼 공통)

```bash
# ooo MCP — 스펙 우선 제어 루프
pip install "ouroboros-ai[all]"
claude mcp add ooo -s user -- ouroboros mcp      # Claude Code
# Codex: setup-all-skills-prompt.md 실행 시 ~/.codex/config.toml 에 [mcp_servers.ooo] 추가
# (Codex CLI는 TOML 만 읽음 — 이전 mcp.json 방식은 무음 무효 처리되던 버그였음)

# semble MCP — 토큰 효율 코드 검색
claude mcp add semble -s user -- uvx --from "semble[mcp]" semble

# rtk — 토큰 최적화 셸 출력
# macOS: brew install rtk  |  Linux: cargo install rtk  |  Windows: winget install rtk
rtk init -g

# oh-my-claudecode 플러그인
/plugin marketplace add https://github.com/Yeachan-Heo/oh-my-claudecode
/plugin install oh-my-claudecode && setup omc
```

---

## 📚 스킬 목록

> 전체 매니페스트: `.agent-skills/skills.json` · 각 폴더의 `SKILL.md` · 161개 로컬 스킬 폴더 = 총 161개 설치 가능 스킬

### 🎯 핵심 오케스트레이션 (15개)

| 스킬 |
|------|
| `autopilot` |
| `bmad` |
| `bmad-gds` |
| `bmad-idea` |
| `deep-dive` |
| `deepinit` |
| `ohmg` |
| `omc` |
| `omx` |
| `spec-kit` |
| `spec-stack` |
| `survey` |
| `team` |
| `ultraqa` |
| `ultrawork` |

### 📋 계획 및 검토 (13개)

| 스킬 |
|------|
| `agentation` |
| `agentic-skills` |
| `browser-harness` |
| `grill-me` |
| `grill-with-docs` |
| `microsoft-agent-framework` |
| `openai-agents-python` |
| `plannotator` |
| `playwriter` |
| `to-issues` |
| `to-prd` |
| `triage` |
| `vibe-kanban` |

### 🤖 에이전트 개발 (5개)

| 스킬 |
|------|
| `cli-anything` |
| `prompt-repetition` |
| `prompts-chat` |
| `skill-standardization` |
| `upskill` |

### ⚙️ 백엔드 (11개)

| 스킬 |
|------|
| `amrouter` |
| `api-design` |
| `api-documentation` |
| `authentication-setup` |
| `backend-testing` |
| `database-schema-design` |
| `payloadcms` |
| `pydantic-ai` |
| `supabase-agent-skills` |
| `typesense` |
| `colibri` |

### 🎨 프론트엔드 (13개)

| 스킬 |
|------|
| `astryx` |
| `ax` |
| `design-system` |
| `devup-ui` |
| `lazyweb` |
| `react-best-practices` |
| `react-bits` |
| `react-grab` |
| `responsive-design` |
| `state-management` |
| `ui-component-patterns` |
| `web-accessibility` |
| `web-design-guidelines` |

### 🔍 코드 품질 (11개)

| 스킬 |
|------|
| `code-refactoring` |
| `code-review` |
| `debugging` |
| `diagnose` |
| `improve-codebase-architecture` |
| `migrate-to-shoehorn` |
| `open-code-review` |
| `performance-optimization` |
| `tdd` |
| `testing-strategies` |
| `zoom-out` |

### 🏗 인프라 (13개)

| 스킬 |
|------|
| `deployment-automation` |
| `environment-setup` |
| `firebase-ai-logic` |
| `firebase-cli` |
| `genkit` |
| `looker-studio-bigquery` |
| `monitoring-observability` |
| `rtk` |
| `scrapling` |
| `security-best-practices` |
| `strix` |
| `system-environment-setup` |
| `vercel-deploy` |

### 📝 문서화 (5개)

| 스킬 |
|------|
| `changelog-maintenance` |
| `presentation-builder` |
| `research-paper-writing` |
| `technical-writing` |
| `user-guide-writing` |

### 📊 프로젝트 관리 (4개)

| 스킬 |
|------|
| `sprint-retrospective` |
| `standup-meeting` |
| `task-estimation` |
| `task-planning` |

### 🔭 검색 및 분석 (13개)

| 스킬 |
|------|
| `academic-research` |
| `autoresearch` |
| `codebase-search` |
| `data-analysis` |
| `deep-research` |
| `heretic` |
| `langsmith` |
| `log-analysis` |
| `opik` |
| `pattern-detection` |
| `scientific-llm-benchmarks` |
| `semble` |
| `skill-autoresearch` |

### 🎬 창의 미디어 (8개)

| 스킬 |
|------|
| `drawio` |
| `motion-previs-studio` |
| `paperbanana` |
| `remotion-video-production` |
| `slides-grab` |
| `video-production` |
| `vox-director` |
| `webtoon-harness` |

### 📢 마케팅 (1개)

| 스킬 |
|------|
| `marketing-automation` |

### 🎮 게임 개발 (8개)

| 스킬 |
|------|
| `game-build-log-triage` |
| `game-ci-cd-pipeline` |
| `game-demo-feedback-triage` |
| `game-performance-profiler` |
| `game-studio-harness` |
| `perfectpixel` |
| `steam-store-launch-ops` |
| `unity-gamedev-skill-pack` |

### 🔧 유틸리티 (41개)

| 스킬 |
|------|
| `agenticskills` |
| `aider-cli-workflow` |
| `caveman` |
| `ccpi-marketplace` |
| `claudekit` |
| `clawteam` |
| `codeflow` |
| `compresso` |
| `fabric` |
| `file-organization` |
| `ghgrab` |
| `git-guardrails-claude-code` |
| `git-submodule` |
| `git-workflow` |
| `github-repo-candidate-quality-gate` |
| `god-tibo-imagen` |
| `google-workspace` |
| `graphify` |
| `harness` |
| `hyperfine-benchmarking` |
| `lapian-notes` |
| `llm-wiki` |
| `lmstudio-cli` |
| `notebooklm` |
| `npm-git-install` |
| `obsidian-second-brain` |
| `okf` |
| `ooo` |
| `open-design` |
| `opencontext` |
| `opencut` |
| `ponytail` |
| `pretext` |
| `scaffold-exercises` |
| `setup-pre-commit` |
| `stitch-skills` |
| `tokhub` |
| `workflow-automation` |
| `write-a-skill` |
| `x-twitter-scraper` |
| `zeude` |

---

## 🧬 TOON 포맷 주입

TOON(Token-Oriented Object Notation)은 스킬 카탈로그를 압축하여 모든 프롬프트에 자동 주입합니다. **JSON/Markdown 대비 40-50% 토큰 절감**.

| 플랫폼 | 파일 | 메커니즘 |
|--------|------|---------|
| Claude Code | `~/.claude/hooks/toon-inject.mjs` | `UserPromptSubmit` 훅 — 26-37ms |
| Antigravity CLI (`agy`) | `~/.gemini/antigravity-cli/hooks/toon-skill-inject.sh` | 라이프사이클 훅 (`agy inspect` 으로 확인) |
| Codex CLI | `~/.codex/skills-toon-catalog.toon` | 정적 카탈로그 |

- **Tier 1** (항상): 스킬 카탈로그 인덱스 (~875-3,500 토큰) — 이름 + 설명 + 태그
- **Tier 2** (온디맨드): 개별 SKILL.toon 전체 내용 (~292 토큰/스킬, 최대 3개)

---

## 🔮 주요 도구

### ooo — 스펙 우선 제어 루프
> 키워드: `ooo` · `ouroboros` · `ooo interview` | 플랫폼: Claude · Codex · Gemini · OpenCode

스펙 우선 개발 프런트도어입니다. **git 데이터에 근거한 인터뷰**로 모호한 요청을 명확히 하고, 계약을 동결하고, **spec-kit으로 실행 계획을 렌더링**한 뒤 **cli-anything harness로 실행**하고, 완료 전에 검증합니다. MCP 서버 설치: `claude mcp add ooo -s user -- ouroboros mcp`.

| Packet / 단계 | 소유자 | 설명 |
|---------------|--------|------|
| Clarify / Spec | `ooo interview` | 라이브 git 데이터(`.ouroboros/interview-context.md`: 커밋 · churn · 기여자, 인터뷰마다 재생성)에 근거해 질문하고, 실행 전 인수 기준 동결 |
| Plan | `spec-kit` (`/speckit.plan` → `/speckit.tasks`) | 동결된 seed에서 검토 가능한 실행 계획을 렌더링 (seed → plan 단방향; `OOO_SPEC_KIT=1` 기본 설치) |
| Plan / Review | `plannotator` + `bmad` | 이미 결정된 작업을 다시 열지 않고 계획 승인 |
| Execute | `cli-anything` (`cli-hub search` → `install` → `launch`) | 실제 소프트웨어를 agent-native CLI harness로 구동; `--json` 출력이 evaluate 단계의 증거 (`OOO_CLI_ANYTHING=1` 기본 설치) |
| Runtime handoff / Execute | `omc` / `omx` / `ohmg` / 필요한 경우 `bmad` fallback | 런타임별 설정과 실행은 해당 runtime skill이 담당 |
| Verify / QA | `browser-harness` | 완료 주장 전에 CDP 브라우저 / QA 근거를 기록 |
| Verify UI / annotate | `agentation` | 명시적 submit 이후에만 UI 피드백 처리 |
| Cleanup | repo cleanup scripts + `worktree-cleanup.sh` | 요약, follow-up queue, worktree 정리 |

### plannotator — 시각적 계획 검토
> 키워드: `plan` | [문서](docs/plannotator/README.md) | [GitHub](https://github.com/backnotprop/plannotator)

AI 계획을 브라우저 UI에서 어노테이션. 클릭 한 번으로 승인 또는 구조화된 피드백 전송. Claude Code, OpenCode, Gemini CLI, Codex CLI 지원.

```bash
bash scripts/install.sh --all
```

### ooo — Ouroboros 스펙 우선 개발
> 키워드: `ooo`, `ouroboros`, `ooo ralph` | [문서](docs/ooo/README.md) | [GitHub](https://github.com/Q00/ouroboros)

**업데이트되는 git 데이터에 근거한** 소크라테스식 인터뷰 → 불변 seed/spec 고정 → **spec-kit이 seed로부터 실행 계획을 렌더링** → **cli-anything harness로 실행**(`--json` 출력 = evaluate 증거) → 완료 주장 전에 검증 → 실제로 검증될 때까지 반복합니다. Claude Code 플러그인 또는 pip으로 설치 가능하며, 스킬 installer가 세 연동을 기본으로 배선합니다.

```bash
# 플러그인 설치 (Claude Code)
claude plugin marketplace add Q00/ouroboros

# pip 설치
pip install ouroboros-ai[all]

# 스킬 설치 (모든 플랫폼)
npx skills add https://github.com/akillness/jeo-skills --skill ooo

# 원샷 installer: 스킬 + ouroboros-ai + git 인터뷰 + spec-kit + cli-anything
bash .agent-skills/ooo/scripts/install.sh
# knob: OOO_GIT_INTERVIEW=0 · OOO_SPEC_KIT=0 · OOO_CLI_ANYTHING=0 · SPEC_KIT_REF=<ref>

# 사용법
bash .agent-skills/ooo/scripts/git-interview-context.sh   # 라이브 git 컨텍스트 갱신
ouroboros init start "작업 관리 CLI를 만들고 싶어요"
# seed 동결 후: /speckit.plan → /speckit.tasks (seed 기준)
cli-hub search <키워드> && cli-hub install <이름>        # execute harness 준비
ouroboros run workflow seed.yaml
ouroboros run resume
ouroboros tui monitor
```

### god-tibo-imagen — Codex 백엔드를 활용한 AI 이미지 생성
> 키워드: `god-tibo-imagen`, `gti`, `image generation`, `codex image` | [문서](docs/god-tibo-imagen/README.md) | [GitHub](https://github.com/NomaDamas/god-tibo-imagen)

의존성 없는 AI 이미지 생성 도구. Codex ChatGPT 백엔드를 활용하며, 기존 `~/.codex/auth.json` 인증을 재사용합니다. CLI(`gti`), Node.js 라이브러리, Python SDK를 지원하며 참조 이미지 입력도 가능합니다.

```bash
# 플러그인 설치 (Claude Code)
claude plugin marketplace add NomaDamas/god-tibo-imagen

# npm 설치 (CLI)
npm install -g god-tibo-imagen

# Python SDK
pip install god-tibo-imagen

# 스킬 설치
npx skills add https://github.com/akillness/jeo-skills --skill god-tibo-imagen

# 사용법
gti --prompt "파란색 사각형 아이콘" --output ./icon.png
gti --prompt "둥글게 만들어줘" --input ./ref.png --output ./out.png
```

### notebooklm — Claude Code용 Google NotebookLM 통합
> 키워드: `notebooklm`, `notebook query`, `google notebooklm` | [문서](docs/notebooklm/README.md) | [GitHub](https://github.com/PleasePrompto/notebooklm-skill)

Patchright 브라우저 자동화를 통해 Claude Code에서 직접 Google NotebookLM 노트북을 조회합니다. 에디터를 벗어나지 않고 업로드된 문서로부터 출처 기반, 인용 포함 답변을 받을 수 있습니다. **로컬 Claude Code 전용** (웹 UI 미지원).

```bash
# 플러그인 설치 (Claude Code)
claude plugin marketplace add PleasePrompto/notebooklm-skill

# 수동 클론
git clone https://github.com/PleasePrompto/notebooklm-skill.git ~/.claude/skills/notebooklm

# 스킬 설치
npx skills add https://github.com/akillness/jeo-skills --skill notebooklm

# 최초 설정 (Google 로그인을 위해 Chrome 창이 열립니다)
python scripts/run.py auth_manager.py setup

# 노트북 추가 및 질문
python scripts/run.py notebook_manager.py add --url "https://notebooklm.google.com/notebook/ID" --name "my-research"
python scripts/run.py ask_question.py --question "주요 발견 사항은 무엇인가요?"
```

### pretext — 빠른 멀티라인 텍스트 측정 & 레이아웃
> 키워드: `pretext`, `text measurement`, `text layout`, `paragraph height` | [문서](docs/pretext/README.md) | [GitHub](https://github.com/chenglou/pretext)

DOM 리플로우 없는 순수 JS/TS 텍스트 측정 및 레이아웃 라이브러리. 문단 높이 계산, 라인별 레이아웃, 이모지·CJK·RTL 지원, DOM·Canvas·SVG 출력 — 캐시된 폰트 메트릭 기반 순수 연산.

```bash
# 플러그인 설치 (Claude Code)
claude plugin marketplace add chenglou/pretext

# npm 설치
npm install @chenglou/pretext

# jeo-skills에서 설치
npx skills add https://github.com/akillness/jeo-skills --skill pretext
```

### zeude — Claude Code 엔터프라이즈 AI 도입 플랫폼
> 키워드: `zeude`, `ai adoption`, `claude code adoption`, `enterprise claude` | [문서](docs/zeude/README.md) | [GitHub](https://github.com/zep-us/zeude)

Claude Code의 Intention-Action Gap을 해결하는 엔터프라이즈 플랫폼. OpenTelemetry 측정, Zeude Shim을 통한 스킬/MCP/훅 중앙 동기화, 프롬프트 시점 스킬 제안으로 3배 도입률 향상(6%→18%). Supabase + ClickHouse 필요.

```bash
# 플러그인 설치 (Claude Code)
claude plugin marketplace add zep-us/zeude

# 자체 호스팅 설치
git clone https://github.com/zep-us/zeude.git
cd zeude && cp .env.example .env
# Supabase, ClickHouse 환경변수 설정

# 스킬 설치
npx skills add https://github.com/akillness/jeo-skills --skill zeude

# 개발자별 Shim 설치 (대시보드에서 agent key 발급 후)
curl -fsSL https://raw.githubusercontent.com/zep-us/zeude/main/install.sh | bash -s -- --key <AGENT_KEY>
```

### compresso — 오프라인 배치 동영상/이미지 압축
> 키워드: `compresso`, `compress video`, `batch compression` | [문서](docs/compresso/README.md) | [GitHub](https://github.com/codeforreal1/compressO)

무료 오픈소스 오프라인 데스크톱 압축 앱 (Tauri+React). 동영상/이미지 배치 압축, 트리밍/분할, 포맷 변환, 자막 삽입, 메타데이터 관리 — FFmpeg/pngquant/jpegoptim/gifski 기반, 네트워크 없이 완전 로컬 처리.

```bash
# 플러그인 설치 (Claude Code)
claude plugin marketplace add codeforreal1/compressO

# macOS Homebrew
brew install --cask codeforreal1/tap/compresso

# jeo-skills에서 설치
npx skills add https://github.com/akillness/jeo-skills --skill compresso
```

### stitch-skills — Stitch MCP 에이전트 스킬
> 키워드: `stitch`, `stitch-design`, `stitch-loop`, `enhance-prompt` | [문서](docs/stitch-skills/README.md) | [GitHub](https://github.com/google-labs-code/stitch-skills)

Stitch MCP 서버를 통한 AI 기반 UI 디자인 생성, 프롬프트 정제, 화면-코드 변환 워크플로우. 고품질 화면, 멀티페이지 웹사이트, DESIGN.md 문서, React/shadcn-ui 컴포넌트, Remotion 동영상 생성을 지원합니다.

```bash
# 플러그인 설치 (Claude Code)
claude plugin marketplace add google-labs-code/stitch-skills

# 스킬 설치 (모든 플랫폼)
npx skills add google-labs-code/stitch-skills --skill stitch-design --global
npx skills add google-labs-code/stitch-skills --skill enhance-prompt --global

# jeo-skills에서 설치
npx skills add https://github.com/akillness/jeo-skills --skill stitch-skills
```

### open-design — 로컬 우선 디자인 아티팩트 생성
> 키워드: `open-design`, `local design tool`, `prototype generation` | [GitHub](https://github.com/nexu-io/open-design)

Anthropic의 Claude Design에 대한 오픈소스 대안. 로컬에 설치된 코딩 에이전트를 사용해 웹/모바일/데스크톱 프로토타입, 프레젠테이션 덱, 미디어 아티팩트를 생성합니다. 72개 내장 디자인 시스템, 5가지 비주얼 방향, 93개 미디어 프롬프트 템플릿, 멀티 포맷 내보내기를 지원합니다.

```bash
# 플러그인 설치 (Claude Code)
claude plugin marketplace add nexu-io/open-design

# 로컬에서 직접 실행
git clone https://github.com/nexu-io/open-design.git
cd open-design && corepack enable && pnpm install
pnpm tools-dev run web

# jeo-skills에서 설치
npx skills add https://github.com/akillness/jeo-skills --skill open-design
```

### semble — 에이전트용 토큰 효율 코드 검색
> 키워드: `semble`, `code search`, `semble search`, `semantic code search` | [GitHub](https://github.com/MinishLab/semble)

grep+read 대비 토큰 사용량 ~98% 절감. 로컬/원격 리포지터리를 ~250ms(CPU만, GPU·API 키 불필요) 안에 인덱싱합니다. 자연어·심볼 쿼리, `find-related`를 통한 의미 기반 유사 코드 탐색, Claude Code·Codex·Cursor·OpenCode용 MCP 서버 통합을 지원합니다.

```bash
# MCP 설치 (Claude Code)
claude mcp add semble -s user -- uvx --from "semble[mcp]" semble

# CLI 설치
pip install semble          # pip
uv tool install semble      # uv

# jeo-skills에서 설치
npx skills add https://github.com/akillness/jeo-skills --skill semble
```

### vibe-kanban — AI 에이전트 칸반 보드
> 키워드: `kanbanview` | [문서](docs/vibe-kanban/README.md) | [GitHub](https://github.com/BloopAI/vibe-kanban)

바운드된 코딩 카드를 위한 코딩 보드 제어면: 필요하면 GitHub Projects·Linear·Jira를 PM 원본으로 유지한 채, 실제 코딩 실행은 격리된 워크스페이스/worktree에서 돌리고, 사람 검토를 명시적으로 거쳐 PR로 넘기는 흐름을 관리합니다.

```bash
npx vibe-kanban
```

---

## 🌐 추천 Harness OSS

| 저장소 | 스타 | 설명 |
|-------|-----:|------|
| [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT) | 182k | 지속적 에이전트를 위한 접근성 높은 AI 플랫폼 |
| [AutoGen](https://github.com/microsoft/autogen) | 55.4k | Microsoft 멀티에이전트 대화 프레임워크 |
| [CrewAI](https://github.com/crewAIInc/crewAI) | 45.7k | 역할 기반 자율 AI 에이전트 오케스트레이션 |
| [smolagents](https://github.com/huggingface/smolagents) | 25.9k | HuggingFace 코드 사고 경량 에이전트 라이브러리 |
| [agency-agents](https://github.com/msitarzewski/agency-agents) | 21.2k | 9개 부서의 61개 특화 AI 에이전트 |
| [revfactory/harness](https://github.com/revfactory/harness) | meta-skill | 에이전트 팀 · 스킬 하네스 설계 플러그인 |
| [revfactory/webtoon-harness](https://github.com/revfactory/webtoon-harness) | harness | 27개 에이전트 웹툰 제작 팀(트렌드 → 세로 스크롤 뷰어) 플러그인 |

> 설치 및 연동 가이드 → [docs/harness/README.ko.md](docs/harness/README.ko.md) · 패키징된 스킬 → [.agent-skills/harness/SKILL.md](.agent-skills/harness/SKILL.md)

---

## 📁 구조

```text
├── .agent-skills/          ← 161개 스킬 폴더 (각각 SKILL.md + SKILL.toon)
├── docs/                   ← 상세 가이드 (bmad, omc, plannotator, ooo, ...)
├── install.sh
├── setup-all-skills-prompt.md
├── README.md               ← English
└── README.ko.md            ← 한국어 (이 파일)
```

---

## 📖 관련 문서

| 도구 | 키워드 | 문서 |
|------|--------|------|
| `ooo` | `ooo`, `ouroboros`, `ooo interview` | [.agent-skills/ooo/SKILL.md](.agent-skills/ooo/SKILL.md) |
| `plannotator` | `plan` | [docs/plannotator/README.md](docs/plannotator/README.md) |
| `vibe-kanban` | `kanbanview` | [docs/vibe-kanban/README.md](docs/vibe-kanban/README.md) |
| `ooo` | `ooo`, `ouroboros` | [docs/ooo/README.md](docs/ooo/README.md) |
| `stitch-skills` | `stitch`, `stitch-design`, `enhance-prompt` | [docs/stitch-skills/README.md](docs/stitch-skills/README.md) |
| `compresso` | `compresso`, `compress video`, `batch compression` | [docs/compresso/README.md](docs/compresso/README.md) |
| `open-design` | `open-design`, `local design tool`, `prototype generation` | [.agent-skills/open-design/SKILL.md](.agent-skills/open-design/SKILL.md) |
| `codeflow` | `codeflow`, `visualize codebase`, `dependency graph` | [.agent-skills/codeflow/SKILL.md](.agent-skills/codeflow/SKILL.md) |
| `slides-grab` | `slides-grab`, `slides grab`, `generate slides` | [.agent-skills/slides-grab/SKILL.md](.agent-skills/slides-grab/SKILL.md) |
| `pretext` | `pretext`, `text measurement`, `text layout` | [docs/pretext/README.md](docs/pretext/README.md) |
| `god-tibo-imagen` | `god-tibo-imagen`, `gti`, `image generation` | [docs/god-tibo-imagen/README.md](docs/god-tibo-imagen/README.md) |
| `notebooklm` | `notebooklm`, `notebook query`, `google notebooklm` | [docs/notebooklm/README.md](docs/notebooklm/README.md) |
| `zeude` | `zeude`, `ai adoption`, `enterprise claude` | [docs/zeude/README.md](docs/zeude/README.md) |
| `harness` | `harness` | [.agent-skills/harness/SKILL.md](.agent-skills/harness/SKILL.md) |
| `webtoon-harness` | `웹툰 만들어`, `웹툰 하네스` | [.agent-skills/webtoon-harness/SKILL.md](.agent-skills/webtoon-harness/SKILL.md) |
| `game-studio-harness` | `게임 제작 하네스`, `게임 제작 사이클`, `stage gate` | [.agent-skills/game-studio-harness/SKILL.md](.agent-skills/game-studio-harness/SKILL.md) |
| `heretic` | `heretic`, `어블리터레이션`, `모델 검열 제거` | [.agent-skills/heretic/SKILL.md](.agent-skills/heretic/SKILL.md) |
| `omc` | `omc` | [docs/omc/README.md](docs/omc/README.md) |
| `bmad` | `bmad` | [docs/bmad/README.md](docs/bmad/README.md) |
| Harness OSS | — | [docs/harness/README.ko.md](docs/harness/README.ko.md) |

---

## 📎 참고 자료

| 컴포넌트 | 출처 | 라이선스 |
|----------|------|---------|
| `omc` | [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) | MIT |
| `ooo` | [Q00/ouroboros v0.29.0](https://github.com/Q00/ouroboros/tree/v0.29.0) | MIT |
| `stitch-skills` | [google-labs-code/stitch-skills](https://github.com/google-labs-code/stitch-skills) | Apache-2.0 |
| `compresso` | [codeforreal1/compressO](https://github.com/codeforreal1/compressO) | AGPL-3.0 |
| `open-design` | [nexu-io/open-design](https://github.com/nexu-io/open-design) | MIT |
| `pretext` | [chenglou/pretext](https://github.com/chenglou/pretext) | MIT |
| `god-tibo-imagen` | [NomaDamas/god-tibo-imagen](https://github.com/NomaDamas/god-tibo-imagen) | MIT |
| `notebooklm` | [PleasePrompto/notebooklm-skill](https://github.com/PleasePrompto/notebooklm-skill) | MIT |
| `zeude` | [zep-us/zeude](https://github.com/zep-us/zeude) | Apache-2.0 |
| `plannotator` | [plannotator.ai](https://plannotator.ai) | MIT |
| `bmad` | [bmad-dev/BMAD-METHOD](https://github.com/bmad-dev/BMAD-METHOD) | MIT |
| `agentation` | [benjitaylor/agentation](https://github.com/benjitaylor/agentation) | MIT |
| `fabric` | [danielmiessler/fabric](https://github.com/danielmiessler/fabric) | MIT |
| `harness` | [revfactory/harness](https://github.com/revfactory/harness) | Apache-2.0 |
| `webtoon-harness` | [revfactory/webtoon-harness](https://github.com/revfactory/webtoon-harness) | MIT |
| `heretic` | [p-e-w/heretic](https://github.com/p-e-w/heretic) | AGPL-3.0-or-later |
| `llm-wiki` | [karpathy/llm-wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) | — |
| `obsidian-second-brain` | [eugeniughelbur/obsidian-second-brain](https://github.com/eugeniughelbur/obsidian-second-brain) (포크: [akillness/obsidian-second-brain](https://github.com/akillness/obsidian-second-brain)) | MIT |
| `graphify` | [safishamsi/graphify](https://github.com/safishamsi/graphify) | MIT |
| `scrapling` | [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling) | BSD-3-Clause |
| `semble` | [MinishLab/semble](https://github.com/MinishLab/semble) | MIT |
| `harness` | [revfactory/harness](https://github.com/revfactory/harness) | Apache-2.0 |
| `strix` | [usestrix/strix](https://github.com/usestrix/strix) | Apache-2.0 |
| `autoresearch` | Andrej Karpathy methodology | — |
| `research-paper-writing` | [Master-cai/Research-Paper-Writing-Skills](https://github.com/Master-cai/Research-Paper-Writing-Skills) | — |
| `academic-research` | [Imbad0202/academic-research-skills](https://github.com/Imbad0202/academic-research-skills) | CC-BY-NC-4.0 |
| `open-code-review` | [alibaba/open-code-review](https://github.com/alibaba/open-code-review) | Apache-2.0 |
| Agent Skills Spec | [agentskills.io](https://agentskills.io/specification) | — |

---

<!-- WHATS-NEW:START -->



> 📜 이전 기록: [`changelog/ko/`](changelog/ko/) (월별 파일, 최신순).

<!-- WHATS-NEW:END -->

---

<div align="center">

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/akillness3q)

⭐ 도움이 됐다면 저장소에 스타를 눌러주세요!

```bash
gh api --silent --method PUT /user/starred/akillness/jeo-skills >/dev/null 2>&1 || true
```

</div>
