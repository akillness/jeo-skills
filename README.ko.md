<div align="center">

<img src="assets/readme-cover.webp" alt="모듈형 스킬 라이브러리 일러스트: 청록색 라우터가 몇 개의 스킬 카드를 선택해 별도의 에이전트 호스트로 보냅니다" width="100%">

# jeo-skills

**에이전트 스킬을 분류한 카탈로그입니다. 필요한 스킬만, 이미 사용하는 에이전트에 설치하세요.**

[![Skills](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fakillness%2Fjeo-skills%2Fmain%2F.agent-skills%2Fskills.json&query=%24.skill_count&label=skills&color=137E73&style=flat-square)](#-스킬-목록)
[![Categories](https://img.shields.io/badge/categories-10-12231E?style=flat-square)](#-카테고리)
[![Format](https://img.shields.io/badge/format-SKILL.md-AC6415?style=flat-square)](https://agentskills.io/specification)
[![CI](https://img.shields.io/github/actions/workflow/status/akillness/jeo-skills/ci.yml?branch=main&label=CI&style=flat-square)](https://github.com/akillness/jeo-skills/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

[빠른 시작](#-빠른-시작) · [작동 방식](#-작동-방식) · [설치 옵션](#-설치-옵션) · [지원 런타임](#-지원-런타임) · [라우터 CLI](#-라우터-cli) · [사용 추적 및 정리](#-사용-추적-및-정리) · [스킬](#-스킬-목록)

[English](README.md) · **한국어** · [Español](README.es-ES.md)

</div>

---

## ✨ 한눈에 보기

| 영역 | 내용 |
|---|---|
| **카탈로그** | 스킬마다 하나의 폴더: `.agent-skills/<name>/SKILL.md`, 개방형 Agent Skills 형식 |
| **메타데이터** | 카테고리, 하위 카테고리, 인터페이스, 번들 및 관계 데이터는 `.agent-skills/skills.json`에 한 번만 저장됩니다 |
| **라우터** | `jeo-skill`로 찾아보고 검색하고 선택 항목을 미리 본 다음, 선택한 항목만 설치합니다 |
| **런타임** | 대부분의 에이전트가 공유하는 루트와 Claude Code, GJC, Antigravity, Aside용 네이티브 루트 |
| **수명 주기** | 사용 추적으로 어떤 에이전트도 로드하지 않은 스킬을 찾고, 정리는 미리 보고 검토하며 되돌릴 수 있습니다 |
| **선택 사항** | Jev 의사결정 하네스와 Jevgrep 검색 기능은 기본적으로 꺼져 있으며 별도로 설정합니다 |

## 🚀 빠른 시작

**옵션 A: 에이전트가 설치하도록 합니다.** Claude Code, Codex, Antigravity CLI(`agy`), Kimi Code, Grok Build, OpenCode 또는 다른 코딩 에이전트에 다음을 붙여 넣으세요.

```text
Read https://raw.githubusercontent.com/akillness/jeo-skills/main/setup-all-skills-prompt.md in full and follow it to install the jeo-skills.
```

이 가이드는 운영체제와 에이전트를 감지하고 기본적으로 전체 카탈로그를 설치합니다("core only"를 요청하면 범위를 좁힐 수 있음). 에이전트가 설치하지 않은 스킬은 삭제하지 않습니다.

**옵션 B: 라우터를 설치한 다음 스킬을 선택합니다.**

```bash
curl -fsSL https://raw.githubusercontent.com/akillness/jeo-skills/main/install.sh | bash
jeo-skill doctor                                    # check catalog and installer prerequisites
jeo-skill search "react performance"                # find skills
jeo-skill install react-best-practices --global --dry-run   # preview
jeo-skill install react-best-practices --global --yes      # install
```

> [!TIP]
> 설치 후 `jeo-skill`을 찾을 수 없으면 `$HOME/.local/bin`을 `PATH`에 추가하세요.

## 🧭 작동 방식

<img src="assets/how-it-works.svg" alt="다이어그램: 카탈로그(SKILL.md 폴더와 skills.json)가 jeo-skill 라우터로 공급되고, 라우터는 npx skills를 통해 선택한 스킬을 공유 루트 또는 네이티브 호스트 루트에 설치합니다. Jev와 Jevgrep은 선택적 경로입니다" width="100%">

1. **카탈로그.** 스킬은 `<name>/SKILL.md` 형태로 평평하게 유지됩니다. 분류 체계는 폴더가 아니라 메타데이터이므로 런타임은 항상 예상한 경로에서 스킬을 찾습니다.
2. **라우터.** `jeo-skill`은 `skills.json`을 기준으로 이름, 번들, 카테고리 및 하위 카테고리를 확인하고, 기록하기 전에 정확한 선택 항목을 표시합니다.
3. **설치.** 선택 항목은 `npx skills@1.7.0 add`에 위임되며 각 대상 런타임의 루트에 복사됩니다.
4. **로드.** 각 호스트는 자체 루트에서 스킬을 검색합니다. 배치는 활성화가 아닙니다. 로딩, 권한, 모델 선택 및 실행은 호스트가 담당합니다.

## 🗂 카테고리

<img src="assets/catalog-map.svg" alt="10개 스킬 카테고리 지도: Web, Infrastructure, Game, Creative Media, CLI Tools, AI and Agents, Engineering, Research and Analysis, Business, Utilities" width="100%">

| 카테고리 | 초점 | 찾아보기 |
|---|---|---|
| 🌐 Web | 프런트엔드, 백엔드, 디자인, API, 인증, 데이터, 테스트, 그래픽 | `jeo-skill list -c web` |
| 🏗 Infrastructure | 배포, 환경, 관측 가능성, 보안, 클라우드 데이터 | `jeo-skill list -c infrastructure` |
| 🎮 Game | 클라이언트, 웹, 디자인 UI, 오디오, 모션 VFX, QA 및 릴리스 | `jeo-skill list -c game` |
| 🎬 Creative Media | 이미지, 비디오, 모션, 오디오, 프레젠테이션, 다이어그램 | `jeo-skill list -c creative-media` |
| ⌨️ CLI Tools | 개발자, AI, 미디어, 자동화, 검색 및 벤치마크 CLI | `jeo-skill list -c cli-tools` |
| 🤖 AI & Agents | 오케스트레이션, 에이전트 프레임워크, 평가, 메모리, 계획 | `jeo-skill list -c ai-agents` |
| 🧰 Engineering | 코드 품질, 테스트, 아키텍처, 문서화, 탐색 | `jeo-skill list -c engineering` |
| 🔭 Research & Analysis | 학술, 웹 리서치, 데이터 분석, 실험, 인텔리전스 | `jeo-skill list -c research` |
| 📣 Business | 마케팅, 지원, 제품 디스커버리, 전략, 실행, 성장 | `jeo-skill list -c business` |
| 🔧 Utilities | 지식, 파일, Git, 워크스페이스, 프로젝트 관리 | `jeo-skill list -c utilities` |

전체 생성 목록은 [스킬 목록](#-스킬-목록)에 있습니다.

## 📦 설치 옵션

| 목표 | 방법 |
|---|---|
| 에이전트의 안내에 따라 전체 설치 | [빠른 시작](#-빠른-시작)의 설정 프롬프트를 붙여 넣습니다 |
| 라우터만 설치(기본값) | 한 줄 명령을 그대로 사용합니다 |
| 라우터 + `starter` 번들 | `JEO_SKILLS_SELECTION=bundle`을 지정한 한 줄 명령 |
| 전체 카탈로그 | `JEO_SKILLS_SELECTION=all`을 지정한 한 줄 명령 |
| 현재 프로젝트에만 설치 | `INSTALL_GLOBAL=false`를 지정한 한 줄 명령 |
| 변경 없이 미리 보기 | `JEO_SKILLS_DRY_RUN=true`를 지정한 한 줄 명령 |
| 특정 스킬 | `jeo-skill install <name> [<name> ...] --global --yes` |
| 번들 또는 카테고리 일부 | `jeo-skill install --bundle <bundle> --global --yes` 또는 `--category <id> [--subcategory <id>]` |

설치 프로그램 변수는 파이프 오른쪽의 `bash`에 지정합니다.

```bash
URL=https://raw.githubusercontent.com/akillness/jeo-skills/main/install.sh
curl -fsSL "$URL" | JEO_SKILLS_SELECTION=bundle bash
curl -fsSL "$URL" | JEO_SKILLS_DRY_RUN=true INSTALL_GLOBAL=false bash
```

<details>
<summary><b>번들</b> — 엄선한 시작 세트</summary>

| 번들 | 스킬 |
|---|---|
| `starter` | jeo-skill, skill-standardization, codebase-search, git-workflow, debugging, testing-strategies |
| `cli-core` | jeo-skill, rtk, semble, zvec-grep, graphify, scrapling |
| `web-frontend` | react-best-practices, responsive-design, web-accessibility, design-system, web-design |
| `web-backend` | api-design, authentication-setup, database-schema-design, backend-testing |
| `web-design` | web-design, design-system, responsive-design, web-accessibility |
| `infrastructure-core` | deployment-automation, environment-setup, monitoring-observability, security-best-practices |
| `game-client` | unity-gamedev-skill-pack, game-studio-harness, game-performance-profiler, awesome-gamedev-agent-skills |
| `game-web` | web-game-development, threejs-fundamentals, implement-fog-of-war |
| `game-art` | game-vfx, rfxgen, perfectpixel, open-design-game-ui-concept, unirig |
| `media-video` | video-production, video-shotcraft, video-motion-previs, shopping-shorts, filmcraft |
| `skill-authoring` | skill-standardization, write-a-skill, upskill |
| `product-management` | pm-skills, create-prd, user-stories, opportunity-solution-tree, north-star-metric |
| `langchain` | langchain-fundamentals, langgraph-fundamentals, deep-agents-core, langsmith |
| `knowledge-repositories` | 22 ontology, code-graph, memory 및 retrieval 운영 가이드 (`jeo-skill install --bundle knowledge-repositories --dry-run`) |
| `ui-design-repositories` | 10 source-pinned UI operators (`jeo-skill install --bundle ui-design-repositories --dry-run`) |

리포지터리 운영 스킬은 고정된 소스를 안내하는 가이드입니다. 설치해도 업스트림 프로젝트를 설치하거나 실행하거나 연결하지 않으며, 해당 단계에는 별도 승인이 필요합니다.

</details>

## 🖥 지원 런타임

| 런타임 | `--agent` | 전역 루트 | 프로젝트 루트 |
|---|---|---|---|
| JeoPi · Jeo(`jeo-code`) · OMP(`oh-my-pi`) | `universal` (기본값), `jeopi`, `jeo`, `omp` | `~/.agents/skills` | `.agents/skills` |
| Codex | `universal` | `~/.agents/skills` | `.agents/skills` |
| Kimi Code | `kimi` (`skills@1.7.0` 대상은 `kimi-code-cli`) | `~/.agents/skills` | `.agents/skills` |
| OpenCode · Cursor | `universal` | `~/.agents/skills` | `.agents/skills` |
| Claude Code | `claude-code` | `~/.claude/skills` (또는 `$CLAUDE_CONFIG_DIR/skills`) | `.claude/skills` |
| GJC | `gjc` | `~/.gjc/agent/skills` | `.gjc/skills` |
| Pi | `pi` | `~/.pi/agent/skills` | `.pi/skills` |
| Antigravity CLI (AGY) | `agy` / `antigravity-cli` | `~/.gemini/antigravity-cli/skills` | `.agents/skills` |
| Grok Build | `grok` | `${GROK_HOME:-$HOME/.grok}/skills` | `.grok/skills` |
| Antigravity IDE | `antigravity` | `~/.gemini/config/skills` | — |
| Crush | `crush` | `~/.config/crush/skills` | `.crush/skills` |
| Aside | `aside` + `--aside-account <id>` | `~/.aside/u/<id>/skills/user/` | — |

> [!NOTE]
> 이 가이드의 현재 호스트·설정 대상에서는 이전 `gemini-cli` 호스트/설치 별칭을 사용하지 않고 Antigravity CLI의 `agy`/`antigravity-cli`를 사용합니다. Google/Gemini 제공자·모델 이름과 AGY의 `.gemini` 저장 경로는 그대로 유효합니다. `kimi`는 `kimi-code-cli`로 정규화되어 공유 루트에 설치합니다. Kimi 자체는 `${KIMI_CODE_HOME:-$HOME/.kimi-code}/skills`와 프로젝트 `.kimi-code/skills`도 검색하지만, 라우터가 그 모든 경로에 복사한다는 뜻은 아닙니다.
> 
> `grok`는 Grok Build의 네이티브 대상이며 setup 가이드에서 명시적으로 선택할 때만 설정합니다. 설치 대상은 `JEO_SKILLS_AGENT=grok`, Jev 단일 프로필은 `JEV_AGENT=grok`로 선택하세요. 같은 이름의 Superagent/VibeKit CLI가 있으므로 setup은 `PATH`만 보고 자동 선택하지 않습니다. 컨트롤러의 `detect`는 바이너리 존재만 보고하며 구현 종류를 검증하지 않습니다. 그 바이너리가 스킬을 자동 로드한다고 가정하거나 자동 업그레이드하지 않습니다.
> 
> 설치하면 스킬 파일을 루트에 기록하지만 런타임에 로그인하거나 시작하거나 새로고침하지는 않습니다. 새로 설치한 스킬이 보이지 않으면 호스트를 새로고침하세요.

### Jev 에이전트별 프로필과 활성화 경계

Jev는 백엔드를 별도로 선택하고 옵트인한 뒤에만 설정합니다. 현재 가이드는 이전 `gemini-cli` 호스트/별칭을 설정 대상으로 사용하지 않으며, 이는 Google/Gemini 제공자·모델의 전역 종료를 주장하는 것이 아닙니다. 호스트와 모델·제공자는 별개입니다.

#### 기본 프로필

| canonical host ID | 기본 프로필 | 독립 실행형 설치 대상 및 비고 |
|---|---|---|
| `jeo` | `jeo` | `jeo` |
| `gjc` | `gjc` | `gjc` |
| `jeopi` | `jeopi` | `jeopi` |
| `pi` | `pi` | `pi` |
| `codex` | `codex` | `codex` |
| `claude` | `claude` | `claude-code` |
| `agy` | `agy` | `antigravity-cli` |
| `kimi` | `kimi` | `kimi-code-cli` (`skills@1.7.0`) |
| `grok` | `grok` | `grok` (Grok Build) |
| `opencode` | `opencode` | `opencode` |
| `omp` | `omp` | `omp` |
| `cursor` | `cursor` | `cursor` |
| `crush` | `crush` | `crush` |
| `antigravity` | `antigravity` | `antigravity` (IDE) |
| `aside` | `aside-u<account>` | `aside` 계정별 프로필 |

호스트 선택은 `JEV_AGENT` > `JEO_SKILLS_AGENT` 순서입니다. 두 변수가 없거나 값이 `universal`이면 감지된 호스트를 각각 독립적으로 구성합니다. 한 호스트의 프로필 우선순위는 `JEO_SKILLS_JEV_PROFILE` > `JEV_PROFILE` > `~/.agents/jev/agents.json`의 canonical host ID 매핑 > host ID와 같은 이름의 프로필입니다. Aside는 계정을 먼저 선택하고 `aside-u<account>`를 기본값으로 사용합니다.

호스트별 설정이 성공하면 기존 컨트롤러의 config-only 경로가 `~/.agents/jev/agents.json`에 canonical host ID 바인딩을 생성하거나 갱신합니다. 이 갱신은 기존 `native`·`scope`·사용자 지정 프로필 할당과 다른 호스트 항목을 보존하며, hook을 등록하지 않습니다. `agy`, `kimi`, `grok`, `opencode` 및 기타 새 호스트의 프로필은 명시적 하네스·수동 경로만 제공하며 native hook 활성화를 주장하지 않습니다.

컨트롤러(`jev-plugin.mjs`)의 `--agent`는 canonical host ID를 사용합니다. 독립 실행형 `jev-setup.sh --agent`의 값은 스킬 설치 대상(`claude-code`, `antigravity-cli`, `kimi-code-cli`, `grok` 등)입니다. 하네스(`jev-harness.mjs`)에는 `--agent` 옵션이나 호스트 자동 감지가 없으므로 모든 작업에 현재 프로필을 `--profile`로 명시해야 하며, 선택한 프로필이 없거나 비활성화되면 다른 프로필이나 레거시 공유 설정으로 대체하지 않습니다.

현재 프로필 상태만 읽으려면 다음처럼 실행하세요(`status`는 읽기 전용이며 구성된 로컬 백엔드를 확인할 수 있지만, 그 결과를 호스트 활성화나 모델 사용의 증거로 추론하지 않습니다).

```bash
node ~/.agents/jev/jev-harness.mjs \
  --profile "${JEV_PROFILE:?현재 할당된 Jev 프로필을 먼저 선택하세요}" status
```

모든 감지 호스트를 대상으로 설정하려면 설정 서브셸 내부에서만 `JEV_AGENT`, `JEV_PROFILE`, `JEO_SKILLS_AGENT`, `JEO_SKILLS_JEV_PROFILE`을 `unset`하고, 활성 세션 바깥의 값은 보존하세요. 프로필 설정만으로 native hook이 자동 활성화되지 않으며, 기존 실제 `HOME` 설치도 삭제하거나 초기화하지 않습니다. 자세한 호스트 매핑과 활성화 경계는 [Jev 활성화 및 프로필 표](jev/jev-control-plane.rule.md#activation-and-profiles), 설정 순서는 [설정 가이드](setup-all-skills-prompt.md#jev-control-plane-harness-system-one)와 [jev/README.md](jev/README.md)를 확인하세요.

## 💻 라우터 CLI

| 명령 | 기능 |
|---|---|
| `jeo-skill categories` | 카테고리 및 하위 카테고리 개수 |
| `jeo-skill list -c <category> [-s <subcategory>]` | 한 분류 구간의 스킬 |
| `jeo-skill search "<query>"` | 이름, 설명 및 분류 체계 검색 |
| `jeo-skill related <name>` | 함께 고려할 중복 또는 순차 스킬 |
| `jeo-skill install ... --dry-run` | 파일을 기록하지 않고 선택 항목 미리 보기 |
| `jeo-skill doctor` | 카탈로그, `npx`/Node.js 사전 요건 및 CLI 링크 확인 |
| `jeo-skill usage scan` / `usage report` | 설치된 스킬 중 에이전트가 실제로 로드한 항목 추적 |
| `jeo-skill prune-unused` / `restore` / `purge-quarantine` | 한 번도 사용하지 않은 스킬 격리, 복원 또는 삭제 |
| `jeo-skill prune-retired --global --dry-run` | 폐기된 카탈로그 스킬의 오래된 복사본 제거 |
| `jeo-skill explore "<question>" --dry-run` | 선택적 Jevgrep 문서 검색 |

모든 명령에서 사용할 카탈로그를 고정하려면 `JEO_SKILLS_CATALOG=/path/to/skills.json`을 설정합니다.

## 🧹 사용 추적 및 정리

<img src="assets/skill-lifecycle.svg" alt="수명 주기 다이어그램: 런타임 기록을 스캔해 로컬 사용 상태로 저장하고, 사용됨·보호됨·유예 중·후보로 보고한 뒤 미리 보고 검토하여 되돌릴 수 있는 격리로 이동합니다. 복원 또는 영구 삭제가 가능하며 카탈로그 폐기는 별도의 유지관리자 경로입니다" width="100%">

`jeo-skill usage scan`은 로컬 런타임 기록(Claude, Codex, OpenCode, Antigravity, Aside, jeopi/GJC/OMP/Pi 세션 및 Jev 주입 원장)을 읽습니다. 사용 요약과 증분 스캔 메타데이터를 `~/.local/state/jeo-skill` 아래에 저장하며, 대화 기록 본문은 저장하지 않습니다. 에이전트가 스킬을 호출하거나 로드한 경우에만 사용으로 집계하고, 프롬프트의 언급은 집계하지 않습니다.

| 상태 | 의미 |
|---|---|
| `used` | 보존된 기록에서 한 번 이상 호출되거나 로드됨 |
| `protected` | `jeo-skill`, `starter`/`cli-core`/`infrastructure-core` 번들, `usage keep` 고정 및 `usage relevance` 보호 |
| `in-grace` | 아직 사용되지 않았지만 추적 시작 또는 최초 설치 후 30일 이내 |
| `candidate` | 유예 기간 후에도 관찰된 사용이 없어 격리 대상 |

```bash
jeo-skill usage scan
jeo-skill usage report --status candidate
jeo-skill prune-unused --global                                   # preview only
jeo-skill prune-unused --global --apply --skip-jev-review         # or --jev-profile <p> --allow-remote
jeo-skill restore --list
jeo-skill restore --batch <batch-id> --apply
jeo-skill purge-quarantine --older-than 30 --apply                # permanent
```

> [!IMPORTANT]
> 관찰된 사용이 없다고 해서 평생 사용하지 않는다는 증거는 아닙니다. 런타임이 오래된 기록을 삭제했을 수 있습니다. `--apply`는 먼저 다시 스캔하며 현재 기록 저장소를 읽을 수 없으면 거부합니다. 이 카탈로그와 일치함을 입증할 수 있는 복사본만 이동하고, 타사 복사본과 심볼릭 링크는 유지합니다.

카탈로그 자체에서 스킬을 제거하는 것은 저장소 체크아웃에서 하는 별도의 유지관리자 단계입니다. 기본은 미리 보기이며, `--apply`에는 쉼표로 구분한 승인 이름과 검토 방식 선택이 필요합니다. 적용하면 프로젝션을 다시 생성하고 검증하며 실패하면 되돌립니다.

```bash
jeo-skill usage report --json > report.json
python3 scripts/retire-unused-skills.py --usage-report report.json                     # preview
python3 scripts/retire-unused-skills.py --usage-report report.json --apply \
  --approve name-a,name-b --skip-jev-review          # or --jev-profile <p> --allow-remote
```

## 🔌 선택적 통합

| 통합 | 목적 | 설정 |
|---|---|---|
| **Jev** | 의사결정 하네스: 작업을 스킬로 라우팅하고, 컨텍스트를 정리하며, 정리 제안을 검토합니다 | `bash jev/jev-setup.sh --profile <name> ...` · [jev/README.md](jev/README.md) |
| **Jevgrep** | 선택한 스킬 또는 위키 문서의 원격 검색 | `jeo-skill explore "<question>" --root <dir> --dry-run` · [jevgrep](.agent-skills/jevgrep/SKILL.md) |

둘 다 카탈로그 설치에 포함되지 않습니다. 둘 다 구성된 백엔드로 데이터를 보낼 수 있습니다. `jeo-skill`에서는 이를 호출하는 명령(`prune-unused --apply`, `usage relevance`, `explore`)이 `--allow-remote` 없이는 원격 사용을 거부합니다. 독립 실행형 Jev 하네스는 구성된 백엔드로 직접 전송하므로, 사용하기 전에 호스팅 프로필을 승인하세요.

## 📚 스킬 목록

> `.agent-skills/skills.json`에서 생성 · 407개 스킬 · 카테고리를 펼치면 스킬 목록이 보입니다.

### 🌐 웹 (69개)

하위 분류: `frontend` (12), `backend` (3), `design` (15), `api` (2), `auth` (1), `data` (13), `testing` (4), `accessibility` (1), `performance` (1), `graphics` (12), `capture` (5)

<details>
<summary>스킬 보기</summary>

| Skill |
|---|
| `ax` |
| `react-best-practices` |
| `react-bits` |
| `state-management` |
| `amrouter` |
| `colibri` |
| `pydantic-ai` |
| `astryx` |
| `build-daily-inspiration-sites` |
| `daily-ui-inspiration-capture` |
| `design-first-ui-prompting` |
| `design-system` |
| `devup-ui` |
| `html-to-interaction-prompts` |
| `lazyweb` |
| `responsive-design` |
| `stitch-skills` |
| `web-design` |
| `api-design` |
| `api-documentation` |
| `authentication-setup` |
| `database-schema-design` |
| `payloadcms` |
| `supabase-agent-skills` |
| `typesense` |
| `backend-testing` |
| `browser-harness` |
| `playwriter` |
| `web-accessibility` |
| `optimize-web-animations` |
| `threejs-animation` |
| `threejs-fundamentals` |
| `threejs-geometry` |
| `threejs-interaction` |
| `threejs-lighting` |
| `threejs-loaders` |
| `threejs-materials` |
| `threejs-postprocessing` |
| `threejs-shaders` |
| `threejs-textures` |
| `agentation` |
| `react-grab` |
| `slides-grab` |
| `stitched-full-page-capture` |
| `chatbot-template` |
| `airship` |
| `moli` |
| `design-taste-frontend` |
| `higgsfield-websites` |
| `stagehand` |
| `helix-foundry` |
| `pg-jev` |
| `orionbelt-ontology-builder` |
| `open-ontologies` |
| `semantica` |
| `utopia` |
| `pixeltable` |
| `turbovec` |
| `pixelrag` |
| `superdesign` |
| `better-design` |
| `design-taste` |
| `canvas-ui` |
| `paper-shaders` |
| `ui-layouts` |
| `hyperiux` |
| `motion-primitives` |
| `cursify` |
| `trickle-ui` |

</details>

### 🏗 인프라 (17개)

하위 분류: `deployment` (2), `environment` (2), `observability` (3), `security` (3), `cloud-data` (6), `automation` (0), `tooling` (1)

<details>
<summary>스킬 보기</summary>

| Skill |
|---|
| `deployment-automation` |
| `vercel-deploy` |
| `environment-setup` |
| `system-environment-setup` |
| `log-analysis` |
| `monitoring-observability` |
| `openocta` |
| `security-best-practices` |
| `strix` |
| `firebase-cli` |
| `unity-cli` |
| `genkit` |
| `looker-studio-bigquery` |
| `zurp` |
| `ai-knowledge-management-platform` |
| `knowledge-catalog` |
| `cocoindex` |

</details>

### 🎮 게임 (29개)

하위 분류: `client` (4), `web` (2), `server` (1), `design-ui` (7), `audio` (1), `animation` (2), `motion-vfx` (2), `sprite-image` (1), `art-resources` (0), `storytelling` (0), `tooling` (3), `qa-performance` (4), `release` (2)

<details>
<summary>스킬 보기</summary>

| Skill |
|---|
| `implement-fog-of-war` |
| `unity-gamedev-skill-pack` |
| `agentic-gamedev-skills` |
| `web-game-development` |
| `bmad-gds` |
| `open-design-game-ui-concept` |
| `open-design-game-ui-handoff` |
| `open-design-game-ui-takeover` |
| `rfxgen` |
| `animato` |
| `unirig` |
| `dalamud-vfx-editor` |
| `game-vfx` |
| `perfectpixel` |
| `game-studio-harness` |
| `underworld-overseer-save-mapper` |
| `godogen` |
| `game-build-log-triage` |
| `game-demo-feedback-triage` |
| `game-performance-profiler` |
| `wai-play` |
| `game-ci-cd-pipeline` |
| `steam-store-launch-ops` |
| `unity-technologies-skills` |
| `multiplayer-game-architecture` |
| `game-design-theory` |
| `game-feel` |
| `game-ui-ux` |
| `awesome-gamedev-agent-skills` |

</details>

### 🎬 크리에이티브 미디어 (40개)

하위 분류: `image` (10), `video` (18), `motion` (1), `audio` (2), `presentation` (1), `diagram` (2), `design` (4), `capture` (0), `storytelling` (2)

<details>
<summary>스킬 보기</summary>

| Skill |
|---|
| `aura-asset-images` |
| `generate-reference-inspired-brand-worlds` |
| `god-tibo-imagen` |
| `paperbanana` |
| `unsplash-asset-images` |
| `browser-video-recording` |
| `gbro-collage-broll` |
| `opencut` |
| `video-production` |
| `filmcraft` |
| `video-shotcraft` |
| `video-to-superprompt` |
| `vox-director` |
| `video-motion-previs` |
| `elevenlabs-tts` |
| `presentation-builder` |
| `drawio` |
| `open-design` |
| `blender-mcp` |
| `webtoon-harness` |
| `palmier-pro` |
| `openstory` |
| `drama-skills` |
| `openmontage` |
| `open-generative-ai` |
| `higgsfield-generate` |
| `higgsfield-marketplace-cards` |
| `higgsfield-product-photoshoot` |
| `higgsfield-soul-id` |
| `higgsfield-youtube-thumbnail` |
| `higgsfield-video-explainer` |
| `higgsfield-brandkit` |
| `shopping-shorts` |
| `video-use` |
| `autoclip` |
| `moneyprinter-turbo` |
| `opencreator` |
| `voicestudio` |
| `diagram-design` |
| `artcraft` |

</details>

### ⌨️ CLI 도구 (42개)

하위 분류: `developer-cli` (10), `ai-cli` (16), `media-cli` (1), `automation-cli` (6), `search-cli` (8), `benchmark-cli` (1)

<details>
<summary>스킬 보기</summary>

| Skill |
|---|
| `soup` |
| `caveman` |
| `ccpi-marketplace` |
| `cli-anything` |
| `ghgrab` |
| `jeo-skill` |
| `pretext` |
| `aider-cli-workflow` |
| `claudekit` |
| `fabric` |
| `ooo` |
| `open-code-review` |
| `ponytail` |
| `zeude` |
| `compresso` |
| `codeflow` |
| `graphify` |
| `headroom` |
| `npm-git-install` |
| `okf` |
| `rtk` |
| `tokhub` |
| `scrapling` |
| `agent-reach` |
| `scrapingant-web-fetch` |
| `semble` |
| `zvec-grep` |
| `x-twitter-scraper` |
| `hyperfine-benchmarking` |
| `codeburn` |
| `mole` |
| `mcp-server-sv-number` |
| `zeroshot` |
| `k-skill-setup` |
| `jevgrep` |
| `openrig` |
| `uzu` |
| `context-mode` |
| `rea` |
| `llmfit` |
| `hyper-extract` |
| `leann` |

</details>

### 🤖 AI 및 에이전트 (74개)

하위 분류: `orchestration` (16), `agent-frameworks` (19), `skill-authoring` (5), `evaluation` (8), `memory` (7), `planning-review` (13), `discovery` (3), `prompting` (3)

<details>
<summary>스킬 보기</summary>

| Skill |
|---|
| `bmad` |
| `deep-dive` |
| `deepinit` |
| `spec-kit` |
| `ecc` |
| `microsoft-agent-framework` |
| `openai-agents-python` |
| `goalflow` |
| `openexecutive` |
| `article-prompts-to-skills` |
| `skill-standardization` |
| `upskill` |
| `write-a-skill` |
| `langsmith` |
| `opik` |
| `skill-autoresearch` |
| `kadath` |
| `mex` |
| `bmad-idea` |
| `grill-me` |
| `grill-with-docs` |
| `plannotator` |
| `survey` |
| `to-tickets` |
| `to-spec` |
| `triage` |
| `openspace` |
| `agentic-skills` |
| `agenticskills` |
| `prompts-chat` |
| `find-skills` |
| `mcp-builder` |
| `ask-matt` |
| `grilling` |
| `setup-matt-pocock-skills` |
| `to-questionnaire` |
| `wayfinder` |
| `writing-for-agents` |
| `agent-guardrails` |
| `agent-system-design` |
| `agent-tool-routing` |
| `reflexion-pattern` |
| `agent-manager` |
| `langchain-fundamentals` |
| `langchain-middleware` |
| `langchain-rag` |
| `langchain-dependencies` |
| `langgraph-fundamentals` |
| `langgraph-persistence` |
| `langgraph-human-in-the-loop` |
| `deep-agents-core` |
| `deep-agents-memory` |
| `deep-agents-orchestration` |
| `langchain-bmad` |
| `a2a-protocol` |
| `agent-benchmarking` |
| `agent-observability` |
| `multi-agent-eval-harness` |
| `agent-memory-architecture` |
| `okf-agent-memory` |
| `agent-workflow` |
| `agent-principles` |
| `paperclip` |
| `jev-control-plane` |
| `anyjev` |
| `typesafe-computer-use` |
| `jev-ultrafast` |
| `agentic-graphrag-blueprint` |
| `memmachine` |
| `memori` |
| `memsearch` |
| `harness2` |
| `ruflo` |
| `agent-beacon` |

</details>

### 🧰 엔지니어링 (24개)

하위 분류: `code-quality` (11), `testing` (3), `architecture` (6), `documentation` (2), `code-navigation` (2)

<details>
<summary>스킬 보기</summary>

| Skill |
|---|
| `audit-reference-originality` |
| `audit-verify-explain-grade-5` |
| `code-refactoring` |
| `code-review` |
| `debugging` |
| `diagnosing-bugs` |
| `github-repo-candidate-quality-gate` |
| `migrate-to-shoehorn` |
| `performance-optimization` |
| `performance-profiling` |
| `scaffold-exercises` |
| `tdd` |
| `testing-strategies` |
| `improve-codebase-architecture` |
| `zoom-out` |
| `nightrun` |
| `changelog-maintenance` |
| `technical-writing` |
| `codebase-search` |
| `codebase-design` |
| `domain-modeling` |
| `implement` |
| `prototype` |
| `codebase-memory-mcp` |

</details>

### 🔭 연구 및 분석 (14개)

하위 분류: `academic` (3), `web-research` (3), `data-analysis` (2), `experimentation` (2), `benchmarking` (1), `intelligence` (3)

<details>
<summary>스킬 보기</summary>

| Skill |
|---|
| `academic-research` |
| `research-paper-writing` |
| `scientific-agent-skills` |
| `deep-research` |
| `heretic` |
| `data-analysis` |
| `pattern-detection` |
| `autoresearch` |
| `scientific-llm-benchmarks` |
| `agent-pulse` |
| `research` |
| `korean-patent-search` |
| `fineenvs` |
| `mi-orchestration` |

</details>

### 📣 비즈니스 (70개)

하위 분류: `marketing` (4), `support` (2), `publishing` (1), `pm-toolkit` (5), `pm-discovery` (13), `pm-strategy` (12), `pm-execution` (12), `pm-market-research` (7), `pm-analytics` (3), `pm-go-to-market` (6), `pm-growth` (5)

<details>
<summary>스킬 보기</summary>

| Skill |
|---|
| `marketing-automation` |
| `write-like-meng-on-x` |
| `x-bookmark-quote-posts` |
| `customer-email-draft-threads` |
| `customer-support-verification` |
| `yuwen-publish-precheck` |
| `youtube-growth-playbook-2026` |
| `pm-skills` |
| `draft-nda` |
| `grammar-check` |
| `privacy-policy` |
| `review-resume` |
| `analyze-feature-requests` |
| `brainstorm-experiments-existing` |
| `brainstorm-experiments-new` |
| `brainstorm-ideas-existing` |
| `brainstorm-ideas-new` |
| `identify-assumptions-existing` |
| `identify-assumptions-new` |
| `interview-script` |
| `metrics-dashboard` |
| `opportunity-solution-tree` |
| `prioritize-assumptions` |
| `prioritize-features` |
| `summarize-interview` |
| `ansoff-matrix` |
| `business-model` |
| `lean-canvas` |
| `monetization-strategy` |
| `pestle-analysis` |
| `porters-five-forces` |
| `pricing-strategy` |
| `product-strategy` |
| `product-vision` |
| `startup-canvas` |
| `swot-analysis` |
| `value-proposition` |
| `brainstorm-okrs` |
| `create-prd` |
| `dummy-dataset` |
| `job-stories` |
| `outcome-roadmap` |
| `pre-mortem` |
| `prioritization-frameworks` |
| `stakeholder-map` |
| `summarize-meeting` |
| `test-scenarios` |
| `user-stories` |
| `wwas` |
| `competitor-analysis` |
| `customer-journey-map` |
| `market-segments` |
| `market-sizing` |
| `sentiment-analysis` |
| `user-personas` |
| `user-segmentation` |
| `ab-test-analysis` |
| `cohort-analysis` |
| `sql-queries` |
| `beachhead-segment` |
| `competitive-battlecard` |
| `growth-loops` |
| `gtm-motions` |
| `gtm-strategy` |
| `ideal-customer-profile` |
| `marketing-ideas` |
| `north-star-metric` |
| `positioning-ideas` |
| `product-name` |
| `value-prop-statements` |

</details>

### 🔧 유틸리티 (28개)

하위 분류: `knowledge` (8), `files` (5), `git` (4), `workspace` (1), `project-management` (4), `productivity` (3), `general` (3)

<details>
<summary>스킬 보기</summary>

| Skill |
|---|
| `lapian-notes` |
| `llm-wiki` |
| `notebooklm` |
| `obsidian-mind` |
| `obsidian-second-brain` |
| `opencontext` |
| `file-organization` |
| `git-guardrails-claude-code` |
| `git-submodule` |
| `git-workflow` |
| `game-sounds` |
| `sprint-retrospective` |
| `standup-meeting` |
| `task-estimation` |
| `task-planning` |
| `google-workspace` |
| `watermarks-remover` |
| `solo-skills` |
| `eli5` |
| `handoff` |
| `resolving-merge-conflicts` |
| `teach` |
| `wait-what` |
| `wizard` |
| `hwp` |
| `rhwp-advanced` |
| `rhwp-edit` |
| `rowboat` |

</details>


---

## 🛠 유지관리자용

| 경로 | 내용 |
|---|---|
| `.agent-skills/` | 스킬 폴더, `skills.json`(소스 오브 트루스) 및 생성된 `skills.toon` |
| `install.sh` · `setup-all-skills-prompt.md` | 한 줄 설치 프로그램과 에이전트 주도 설정 가이드 |
| `scripts/` | 카탈로그 검증, 프로젝션 생성, 변경 로그 및 회귀 테스트 |
| `jev/` | 선택적 Jev 컨트롤 플레인 소스 |
| `changelog/` | 월별 릴리스 노트(영어 및 한국어) |
| `assets/` | README 시각 자료(Codex 생성, 출처는 `assets/readme-visuals.json`) |

```bash
python3 scripts/validate-catalog-projections.py        # manifest, TOON, READMEs, SKILL.md
python3 scripts/generate-catalog-projections.py --check
python3 scripts/changelog.py check
```

메타데이터는 생성된 표가 아니라 `skills.json`에서 편집하세요. 다른 프로젝트에서 적용한 스킬의 업스트림 소스와 라이선스는 [docs/attribution.md](docs/attribution.md)에 나열되어 있습니다.

## 🤝 관련 프로젝트

| 프로젝트 | 역할 |
|---|---|
| [jeo-code](https://github.com/akillness/jeo-code) | 공유 루트에서 스킬을 로드하는 코딩 에이전트 |
| [gajae-code (GJC)](https://github.com/akillness/gajae-code) | 자체 네이티브 스킬 루트를 사용하는 에이전트 런타임 |

---

<!-- WHATS-NEW:START -->

## 🆕 v2026-10-24 업데이트

| 변경 사항 | 상세 내용 |
|--------|---------|
| **크로스 엔진 게임 스킬 컬렉션** | `gamedev-skills/awesome-gamedev-agent-skills` 커밋 `7eb1b53305fab881f4758e2eff2e371cd7869221`(Apache-2.0, LICENSE·NOTICE 확인)에 고정한 `awesome-gamedev-agent-skills` v1.0.0 운영 가이드를 추가했습니다. 카탈로그는 406→407개, `game-client`는 가이드 3→4개입니다. 원본의 개별 스킬 76개와 라우터를 통째로 복제하지 않고 선별하며, 기존 프로젝트 엔진 버전과 동명 로컬 스킬을 보존합니다. |
| **게임 컬렉션 검증** | 전용 subprocess 테스트 6/6·설치 회귀 66/66 및 선택 공개 소스 12개 해시 일치를 확인했습니다. 로컬 작업 트리를 원본으로 삼아 임시 런처로 캐시된 실제 `skills@1.7.0`을 실행한 프로젝트 범위 설치에서 미리보기, 중첩 파일 바이트·권한, 지문이 일치하는 은퇴 `jeo` 제거, 동명 외부·현행 스킬·HOME 보존이 통과했습니다. npm 조회, 공개 저장소 설치, 실제 HOME 활성화, 엔진·프로바이더 실행은 하지 않았습니다. 라우팅·안전 평가 6개는 작성된 시나리오이며 실행된 모델 품질 결과가 아닙니다. |
| **현재 코딩 에이전트와 Jev 프로필 바인딩** | config-only 컨트롤러가 canonical host ID를 독립 `agents.json` 프로필에 연결하고 기존 배정·사용자 필드·저장 키·LM Studio 자동 모델 선택을 보존하며 훅은 등록하지 않습니다. LM Studio 모델이 비어 있어도 자동 감지 경로로 프로필을 활성화할 수 있습니다. 현재 대상은 Gemini CLI 대신 `agy`를 사용하며 Kimi(`kimi` → `kimi-code-cli`), Grok Build(`grok`, `.grok/skills`, `GROK_HOME`)와 OpenCode를 모든 README에 명시했습니다. 공유·안전하지 않은 매핑과 링크된 런타임 상위 경로는 설정 전에 거부합니다. setup 자동 호스트 선택은 Superagent/VibeKit 이름 충돌 때문에 `grok`를 제외하며, 컨트롤러 `detect`는 구현 검증이 아닌 바이너리 존재만 보고합니다. |

## 🆕 v2026-10-22 업데이트

| 변경 사항 | 상세 내용 |
|--------|---------|
| **Aside 이후 macOS의 uvx MCP 서버** | 설치 가이드를 실제 홈에 적용하다가, Aside 세션 안에서 uv가 처음 내려받은 wheel에 `com.apple.quarantine ...;Aside;`가 남는 문제를 확인했습니다. macOS가 로드 시점에 확장 모듈(`.so`)을 지우고, uvx는 깨진 캐시 환경을 계속 재사용해서 `uvx`로 등록한 `semble`·`ooo`가 `No module named 'orjson.orjson'` 또는 `'rpds.rpds'`로 실패합니다. 가이드의 Semble·Ouroboros 블록, Aside 섹션, `ooo` 스킬에 증상, `xattr` 확인 방법, 복구 절차(uv 기반 MCP 서버를 멈추고 일반 터미널에서 `uv cache clean` 실행 후 재시도)를 추가했습니다. 새 캐시에서 검증했으며 `--refresh`, `--reinstall`, `uv cache clean <패키지>`로는 해결되지 않고, uv로 띄운 서버가 실행 중이면 `uv cache clean`이 대기합니다. |

## 🆕 v2026-10-21 업데이트

| 변경 사항 | 상세 내용 |
|--------|---------|
| **Agent Beacon 운영 스킬** | `Asymptote-Labs/agent-beacon` 커밋 `cfbd7b1d721664e3b1b5ca2fca5eac4327532c07`(MIT)에 고정한 `agent-beacon` v1.0.0을 추가했습니다. 하네스 간 세션 기록, 로컬·클라우드 목적지, 검토된 메모리, 렌즈, 공유, CLI·MCP 통합을 다루며 수집·개인 데이터·서비스·업로드·제거에 명시적 승인을 요구합니다. 카탈로그는 405→406개, `knowledge-repositories`는 가이드 22개·선택 파일 helper 19개가 됩니다. 설치는 가이드와 지원 파일만 추가하며 Beacon 런타임은 설치하지 않습니다. |
| **Beacon 오프라인·설치 검증** | 기존 안전한 no-Git 구현을 재사용한 독립 helper로 공식 공개 파일 12개 해시 일치를 확인했습니다. 수정한 helper 20/20·설치 65/65 테스트가 통과했으며 이름 지정 설치, 중첩 지원 파일, 같은 루트의 은퇴 `jeo` 제거, 서드파티·현행 스킬 보존과 무변경 미리보기를 검증합니다. 설치 검증은 격리된 fixture 전송이며 실제 공개 설치 증명이 아닙니다. 라우팅·개인정보 평가 6개는 작성된 시나리오로, 실행한 모델 품질 결과가 아닙니다. |
| **설치 가이드 수정** | 격리된 macOS HOME에서 `setup-all-skills-prompt.md` 전체 설치(실제 `skills@1.7.0`, uv, npm, Claude Code, Codex, opencode 2.0.32)를 실행해 발견한 문제를 고쳤습니다. Step 1이 `$HOME`이 다른 곳을 가리켜도 로그인 홈으로 설치하던 문제(이제 Aside 밖에서는 `$HOME`을 따름)와 `~/.local/bin`이 `PATH`에 없어 `jeo-skill`·`graphify`를 찾지 못하던 문제, 비대화형 `rtk init -g`가 훅을 등록하지 않던 문제(`--auto-patch` 사용), MCP SDK 1.x를 고정하는 `[all]` 위에 `ooo`를 등록해 `ouroboros mcp serve`가 시작되지 않던 문제(`uvx --isolated --from 'ouroboros-ai[mcp]'` 사용), Aside 단계가 JSONC `opencode.json`을 덮어써 주석과 다른 키를 모두 지우던 문제(`opencode mcp add` 사용), knowledge-pipeline 작성기가 사용자 래퍼를 덮어쓰고 매번 settings를 다시 쓰던 문제(보존·보고, 변경 시에만 쓰기, 비ASCII 유지)를 수정했습니다. Step 4D는 검증과 오래된 `~/.config/opencode/skills` 사본 보고만 하고, Step 7은 범위 지정된 `skills list -g -a universal`을 씁니다(범위 없는 형태는 큰 홈에서 150초 넘게 멈춤). 깨진 코드 펜스 3개를 복구하고 Step 6–7을 온디맨드 참고 섹션 앞으로 옮겼습니다. HOME에서 실행한 `jeo-skill`은 더 이상 레거시 `~/.agent-skills/skills.json`을 읽지 않습니다. |
| **설치 검증** | 수정 후 full·core·minimal 모드가 끝까지 통과했습니다(모든 단계 exit 0, Claude Code에서 semble·ooo·aside·OMC 플러그인 서버 모두 Connected, 공유·Claude·GJC·Antigravity CLI·Aside 루트의 설치 바이트가 저장소와 일치, 미리 넣어 둔 사용자 스킬·훅·JSONC 설정 보존). 두 번째 full 실행은 가이드가 관리하는 설정을 바꾸지 않았습니다. 새 `scripts/test_setup_guide_regressions.py`(7개)를 CI에서 실행하며 installer 64/64, Jev 64/64, config writer 24/24, 카탈로그 게이트가 통과합니다. |
| **가독성 중심 README 재구성** | README 본문과 시각 자료를 모두 교체했습니다. Codex로 만든 새 커버 `assets/readme-cover.webp`와 `how-it-works.svg`, `catalog-map.svg`, `skill-lifecycle.svg`, 설치 옵션·런타임·라우터 CLI·수명 주기 상태 표, 접을 수 있는 카테고리 목록, 실시간 스킬 수 배지를 추가했습니다. 추천 도구·추천 OSS·관련 문서·긴 운영 노트는 제거하고, 업스트림 출처와 라이선스는 `docs/attribution.md`로 옮겼습니다. `catalog-install-flow.svg`, `runtime-boundaries.svg`는 폐기했으며 설치 변수는 파이프의 `bash` 쪽에 두도록 안내합니다. 문서 전용 변경입니다. |
| **Open Ontologies 운영 스킬 정비** | 이미 등록된 `open-ontologies`를 v1.1.0으로 정비해 중복 추가 없이 405개를 유지했습니다. 고정 커밋 `dfb09bf815326913d7d7822fa7228f2602fb4976`(MIT)의 선택 공개 파일 6개 해시를 재확인하고 오프라인 preflight, 승인·검증 범위, setup·README 레퍼런스를 보강했습니다. 이름 지정 설치와 독립 helper 회귀를 추가해 수정 스위트 64/64·19/19가 통과했으며 카탈로그 지문이 일치하는 `jeo`만 제거하고 현행·동명 서드파티·범위 밖 스킬을 보존합니다. 카탈로그 설치는 운영 스킬 패키지만 추가하며 업스트림 런타임은 설치하지 않습니다. |
| **harness → harness2** | revfactory `harness` 스킬을 `google-research/harness2` 운영 스킬 `harness2`로 교체했습니다. `1cfe254e8d25b15f37048c3730134686abe60335`(Apache-2.0)에 고정하고, 크레덴셜 없는 데모, LAB/JobBench/WorkBuddy 설정과 유료 실행 승인 게이트, Codex 브리지, Propose–Probe–Compose를 직접 적용하는 method 모드(에이전트 팀 설계 이관)를 안내합니다. `harness`는 `retired_skills`로 옮기고 모든 라우팅을 새 담당 스킬로 바꿨습니다. |
| **운영 스킬 4종 추가** | `ruflo`(ruvnet/ruflo, MIT), `voicestudio`(debpalash/VoiceStudio, AGPL-3.0-only), `diagram-design`(cathrynlavery/diagram-design, MIT), `artcraft`(storytold/artcraft, MIT OR Apache-2.0)를 커밋 고정, 오프라인 preflight, 설치·모델·프로바이더·서버·배포 승인 게이트와 함께 추가했습니다. `harness` 은퇴를 반영해 카탈로그가 401개에서 405개가 됐습니다. |
| **설치 시 은퇴 스킬 정리** | `jeo-skill install`과 `install.sh`가 설치 대상 루트에서 은퇴한 `jeo`(→ `ooo`)·`harness`(→ `harness2`)의 오래된 카탈로그 사본을 제거하며, `jeo-skill prune-retired [--global] [--dry-run]`으로 모든 런타임 루트를 점검합니다. frontmatter 이름과 첫 제목이 카탈로그 사본과 정확히 일치할 때만 지우고, 링크는 같은 정리에서 지운 사본을 가리킬 때만 해제합니다. 다른 출처의 동명 스킬·무관한 링크·링크된 상위 경로는 유지합니다. `.skill-lock.json`은 수정하지 않습니다. |
| **검증** | 설치 회귀 63/63(신규 15개, 고정 fixture), 저장소 preflight 회귀 15/15(신규 helper 5종과 harness2 bench/method 사례), 카탈로그 투영·frontmatter·레이아웃·changelog 게이트 통과, 평가 시나리오 25개 추가. 이 머신의 오래된 사본을 그대로 복제한 격리 HOME에서 실제 고정 버전 `skills@1.7.0`으로 문서의 전체 설치(Step 4–4E, 7)를 처음부터 끝까지 실행했습니다. 설치 원본은 이 작업 트리를 커밋한 로컬 스냅숏이며(GitHub URL을 그쪽으로 우회), 공개 HEAD에는 push 전까지 이 변경이 없습니다. 모든 은퇴 사본과 이를 가리키는 링크가 제거되고 무관한 스킬·링크·Aside `builtin/`은 바이트 단위로 유지됐으며, 실제 jeopi/oh-my-pi/GJC 로더가 새 스킬 5종을 찾고 `jeo`/`harness`는 찾지 않음을 확인했습니다. OpenCode는 공유 루트 배치만 확인했고 런타임 활성화는 확인하지 않았습니다. upstream harness2 데모는 두 재귀 모드 모두 2/2 작업이 통과했고 단위 테스트 5개도 통과했습니다. 벤치마크·모델·심사 등 다른 upstream 런타임은 실행하지 않았습니다. |
| **스킬 사용 추적과 미사용 스킬 정리** | `jeo-skill usage scan`이 Claude·Codex·OpenCode·Antigravity·Aside·jeopi/GJC/OMP/Pi 세션과 Jev의 로컬 기록에서 사용 요약과 증분 스캔 메타데이터만 보존하고(대화 본문 제외), 호출·로드·Jev 전체 본문 주입만 사용으로 집계합니다. 전체 이력 0회와 추적 시작 후 30일 유예를 모두 충족한 항목만 후보로 삼으며 핵심 번들·핀·`usage relevance` 보호는 제외합니다. `prune-unused`는 확인 가능한 카탈로그 사본만 되돌릴 수 있게 격리하고 서드파티 사본·링크는 보존하며, Jev `deny`/사용 불가는 적용을 중단합니다. `restore`/`purge-quarantine`과 관리자용 `retire-unused-skills.py --approve`를 분리했습니다. 설치기와 `install.sh`는 추적이나 훅 등록을 시작하지 않으며, `usage scan`이 집계 트래커 상태와 30일 유예 시계를 만듭니다. 이미 활성화한 Jev 훅은 scan 전에도 같은 상태 디렉터리의 `jev-usage.jsonl`에 라우팅·주입 이벤트를 남기고 주입만 사용으로 셉니다. usage 7·quarantine 15·retirement 7 Python 회귀와 Node ledger 테스트 4개가 통과했으며, 실제 데이터 read-only scan은 `/tmp`에서 실행하고 호스트 추적 상태와 훅은 시작하지 않았습니다. |
| **README 시각 자료 갱신** | 새 Codex 커버 `assets/readme-cover.webp`와 `catalog-install-flow.svg`, `runtime-boundaries.svg`, `skill-lifecycle.svg` 다이어그램으로 갱신했습니다. `readme-hero.webp`, `catalog-workflow.svg`, `runtime-architecture.svg`, 고아 `assets/scrapingant/` 로고를 더 이상 사용하지 않으며, 중복 `ooo` 문서 병합, god-tibo-imagen·plannotator 명령 수정, 운영 스킬 수 12개→18개를 반영했습니다. 문서 전용 변경입니다. |

## 🆕 v2026-10-17 업데이트

| 변경 사항 | 상세 내용 |
|--------|---------|
| **OpenCreator 운영 스킬** | `krillinai/OpenCreator` 커밋 `b01a9f71165b9010216e25c462653b0cfa33cbce`에 고정한 `opencreator` 가이드를 추가했습니다. Desktop/CLI/Server 선택, 제작 작업, Codex·provider 설정, Skills/MCP/일정, 릴리스 무결성과 승인 경계를 다룹니다. 오프라인 읽기 전용 사전 점검과 작성된 시나리오 11개, CI에 연결된 전용 회귀 테스트 16개를 추가해 모두 통과했습니다. 카탈로그는 400개에서 401개로 늘었습니다. 업스트림 앱·설치 프로그램·provider·유료 서비스는 실행하지 않았습니다. |

## 🆕 v2026-10-15 업데이트

| 변경 사항 | 상세 내용 |
|--------|---------|
| **UI 소스 고정 운영 스킬 10개** | Superdesign, Better Design, Design Taste, Canvas UI, Paper Shaders, UI Layouts, Hyperiux, Motion Primitives, Cursify, Trickle UI Kit 가이드를 추가했습니다. 정확한 저장소·커밋·선택 소스·전체 라이선스 관찰·중복 결정을 `docs/ui-design-repositories.md`와 독립 레퍼런스에 기록했습니다. |
| **선택 설치와 재사용 권한** | `ui-design-repositories` 번들은 문서만 추가합니다(390 → 400개). 기존 스킬 삭제는 0개이며 시스템 거버넌스·레시피·성능 진단 역할을 보존했습니다. Canvas UI 배포 제한, Hyperiux Effects 별도 조건, Cursify 라이선스 부재를 명시하고 업스트림 컴포넌트 코드는 포함하지 않았습니다. |
| **오프라인 검증 범위** | 패키징·라우터 회귀 6개가 통과했고 Ubuntu/macOS CI에 연결했습니다. 평가 시나리오 45개는 작성된 픽스처이지 실행한 모델 품질·브라우저 평가가 아닙니다. 업스트림 설치·서버·원격 디자인 호출·유료 서비스·UI 런타임은 실행하지 않았습니다. |
| **OKF Agent Memory 운영 스킬** | 별도 Go CLI·stdio MCP 프로젝트인 `okf-memory/okf-agent-memory`를 위한 `okf-agent-memory`를 추가했습니다. upstream 커밋 `ad7beb01b9d4294d8dd28c25494d274374985b69`(MIT)에 고정하고 OKF v0.2 프로젝트 메모리, 명령, 보안, 승인 경계를 안내합니다. |
| **라우팅과 카탈로그** | `ai-agents/memory`로 등록하고 `okf` 및 지식 관리 스킬과 연결했습니다. 기존 `okf`는 Google OKF v0.1 문서 작성 경로로 명확히 구분했습니다. 매니페스트 투영, README 3개 언어의 현재 개수, setup 안내, `AGENTS.md`, `.mex/ROUTER.md`를 갱신해 카탈로그가 367개에서 368개가 됐습니다. 새 운영 스킬과 기존 `okf` 경계에 평가 시나리오 9개를 추가했습니다. |
| **읽기 전용 사전 점검과 회귀** | 고정 커밋과 공개 소스 경로를 확인하는 표준 라이브러리 기반 단독 preflight를 추가했습니다. 심볼릭 링크 경로와 1 MiB 초과 파일을 거부하고 Git 환경을 allowlist로 제한하며 업스트림 실행 파일은 호출하지 않습니다. 공용 사전 점검 회귀 13/13이 통과했고 악성 경로, 커밋 고정, 링크, 크기, 무변조, 자격증명 격리를 확인했습니다. |
| **업스트림 문서 충돌 및 실행 범위** | 고정 `go.mod`는 Go 1.26.0을 요구하지만 시작 가이드는 1.22+라고 안내합니다. 스킬에 이 충돌을 기록했습니다. 업스트림 설치·빌드·bootstrap·MCP 등록과 대상 프로젝트 쓰기는 실행하지 않았습니다. |

> 📜 이전 기록: [`changelog/ko/`](changelog/ko/) (월별 파일, 최신순).

<!-- WHATS-NEW:END -->

---

<div align="center">

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-AC6415?style=flat-square&logo=buy-me-a-coffee)](https://www.buymeacoffee.com/akillness3q)

jeo-skills가 도움이 되었다면 저장소에 ⭐를 눌러 주세요.

</div>
