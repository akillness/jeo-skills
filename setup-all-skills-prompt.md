# Agent Skills — LLM Installation Delegation Guide

> **For AI Agents**: Read this file in full, then execute all steps without asking for further confirmation. Default installation is **full** — only skip steps if the user explicitly requests "minimal" or "core only."

> **CRITICAL — Preserve Existing Skills**: This installation MUST NOT delete or remove any skills that were not installed by this guide. Only add new skills or overwrite/update skills from this repository. Never run `skills remove`, `skills clear`, `skills reset`, or any destructive command. If a skill already exists, update it in place.

> **CRITICAL — No Duplicate Platform Exposure**: Platform-specific skills (`omc`, `ohmg`, `omx`, `ralphmode`) MUST only be linked to their target agent(s). Use `-a` to target specific agents — never use `-a '*'` for platform-specific skills.

> ```bash
> curl -s https://raw.githubusercontent.com/akillness/oh-my-skills/main/setup-all-skills-prompt.md
> ```

---

## Execution Principles

| Perspective | Rule |
|-------------|------|
| **Systems Engineer** | Lock defaults explicitly — full install unless overridden |
| **New User** | Eliminate ambiguity — run the complete installation by default |
| **Guide Author** | Skip full install only when user says "core only" or "minimal install" |
| **Preservation Rule** | Never delete existing skills — only add new or overwrite skills from this repo |
| **Dedup Rule** | Platform-specific skills target only their agents; shared skills target all agents |

---

## Step 0 — Environment Assessment

Check which AI platforms are installed and set the installation root:

```bash
# skills CLI installs to ~/.agents/skills/ and symlinks to all platform paths
SKILLS_ROOT="$HOME/.agents/skills"
REPO_URL="https://github.com/akillness/oh-my-skills"

# Detect available platforms and build agent target list
echo "=== Platform Detection ==="
DETECTED_AGENTS=""
if command -v claude   &>/dev/null; then echo "✅ Claude Code";  DETECTED_AGENTS="${DETECTED_AGENTS:+$DETECTED_AGENTS,}claude-code"; fi
if command -v codex    &>/dev/null; then echo "✅ Codex CLI";    DETECTED_AGENTS="${DETECTED_AGENTS:+$DETECTED_AGENTS,}codex"; fi
if command -v gemini   &>/dev/null; then echo "✅ Gemini CLI";   DETECTED_AGENTS="${DETECTED_AGENTS:+$DETECTED_AGENTS,}gemini-cli"; fi
if command -v opencode &>/dev/null; then echo "✅ OpenCode";     DETECTED_AGENTS="${DETECTED_AGENTS:+$DETECTED_AGENTS,}opencode"; fi

[ -z "$DETECTED_AGENTS" ] && { echo "⚠️  No AI agents detected. Install at least one platform first."; exit 1; }
echo ""
echo "Target agents: $DETECTED_AGENTS"

# Snapshot existing skills BEFORE installation (for preservation check)
echo ""
echo "=== Existing Skills (will be preserved) ==="
if [ -d "$SKILLS_ROOT" ]; then
  ls "$SKILLS_ROOT" 2>/dev/null | sort > /tmp/skills_before.txt
  cat /tmp/skills_before.txt
  echo "($(wc -l < /tmp/skills_before.txt | tr -d ' ') skills found — none will be removed)"
else
  echo "(skills directory not yet created)"
  touch /tmp/skills_before.txt
fi

# Ensure skills CLI is available
if ! command -v skills &>/dev/null; then
  echo ""
  echo "Installing skills CLI..."
  npm install -g skills
fi
```

---

## Step 1 — Install All 89 Skills (Batch)

Install all skills to the global location, then link shared skills to all detected agents.
Re-running this step safely overwrites existing skills (symlinks are updated in place).

> **Do not skip Step 2** — it re-links platform-specific skills to their correct agents only.

```bash
# ────────────────────────────────────────────────────────
# Flag reference:
#   -g          : install to global location (~/.agents/skills/)
#   -a <agents> : link to specific agents (comma-separated, or '*' for all)
#   --skill <s> : select specific skills (comma-separated, or '*' for all)
#   --yes       : skip interactive prompts
#   --copy      : copy files instead of symlinks (robust overwrite)
# ────────────────────────────────────────────────────────

# Install ALL 89 skills to global store, link shared skills to all detected agents
# Platform-specific skills (omc, ohmg, omx, ralphmode) are re-targeted in Step 2
skills add -g "$REPO_URL" --skill '*' -a '*' --yes --copy
```

> **jeo**: Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` on Claude Code. Creates a `.jeo/` ledger (long-term.md, short-term.md, planned.md, progress.md, history.md) for durable workflow state.
>
> **agentation MCP**: `npx add-mcp "npx -y agentation-mcp server"` — auto-detects 9+ agents.
> **agentation Claude Code Official Skill**: `npx skills add benjitaylor/agentation -g` → `/agentation` in conversation.
>
> **presentation-builder**: Requires Node.js 18+, `npx playwright install chromium`, and `slides-grab --help` before first use. Best for real deck artifacts (investor / roadmap / launch / architecture-demo / workshop / game-pitch) that need browser review before PPTX/PDF handoff.

---

## Step 2 — Fix Platform-Specific Skill Links (Dedup)

Platform-specific skills must only appear on their target agent(s).
This step **re-links** them with correct `-a` targeting, replacing the `*` links from Step 1.

```bash
# ╔══════════════════════════════════════════════════════════════╗
# ║  Platform Skill Mapping (from SKILL.md metadata)            ║
# ║                                                              ║
# ║  omc       → Claude Code only                               ║
# ║  ohmg      → Gemini CLI (+ Antigravity)                     ║
# ║  omx       → Codex + Claude Code + Gemini CLI               ║
# ║  ralphmode → Claude Code + Codex + Gemini CLI               ║
# ╚══════════════════════════════════════════════════════════════╝

# omc — Claude Code only
skills add -g "$REPO_URL" --skill omc -a 'claude-code' --yes --copy

# ohmg — Gemini CLI (+ Antigravity if available)
skills add -g "$REPO_URL" --skill ohmg -a 'gemini-cli,antigravity' --yes --copy

# omx — Codex CLI primary, also usable from Claude Code and Gemini CLI
skills add -g "$REPO_URL" --skill omx -a 'codex,claude-code,gemini-cli' --yes --copy

# ralphmode — Claude Code, Codex CLI, Gemini CLI (not OpenCode)
skills add -g "$REPO_URL" --skill ralphmode -a 'claude-code,codex,gemini-cli' --yes --copy

# ── Clean stale symlinks from non-target agents ──
echo ""
echo "=== Cleaning duplicate platform skill links ==="

cleanup_skill_link() {
  local skill="$1"; shift
  local allowed=("$@")

  for agent_dir in ~/.claude/skills ~/.codex/skills ~/.gemini/skills ~/.config/opencode/skills; do
    local agent_name
    case "$agent_dir" in
      */.claude/*)          agent_name="claude-code" ;;
      */.codex/*)           agent_name="codex" ;;
      */.gemini/*)          agent_name="gemini-cli" ;;
      */.config/opencode/*) agent_name="opencode" ;;
    esac

    local is_allowed=false
    for a in "${allowed[@]}"; do
      [[ "$a" == "$agent_name" ]] && is_allowed=true
    done

    if ! $is_allowed && [ -e "$agent_dir/$skill" ]; then
      rm -rf "$agent_dir/$skill"
      echo "  Removed $skill from $agent_name (not a target platform)"
    fi
  done
}

cleanup_skill_link "omc"       "claude-code"
cleanup_skill_link "ohmg"      "gemini-cli" "antigravity"
cleanup_skill_link "omx"       "codex" "claude-code" "gemini-cli"
cleanup_skill_link "ralphmode" "claude-code" "codex" "gemini-cli"

echo "✅ Platform skill deduplication complete"
```

---

## Step 3 — Platform-Specific Setup

Run the setup script for every detected platform:

```bash
# Claude Code — jeo hook + oh-my-claudecode
if command -v claude &>/dev/null; then
  bash "$SKILLS_ROOT/jeo/scripts/setup-claude.sh"
  echo "✅ Claude Code configured"
fi

# Gemini CLI — jeo AfterAgent hook
if command -v gemini &>/dev/null; then
  bash "$SKILLS_ROOT/jeo/scripts/setup-gemini.sh"
  echo "✅ Gemini CLI configured"
fi

# OpenCode — oh-my-opencode
if command -v opencode &>/dev/null; then
  curl -s https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/refs/heads/master/docs/guide/installation.md
  echo "✅ OpenCode — check guide above, then run: skills add -g $REPO_URL --yes --copy"
fi
```

**Claude Code additional setup:**

```bash
# oh-my-claudecode plugin (optional — adds /oh-my-claudecode:* commands)
/plugin marketplace add https://github.com/Yeachan-Heo/oh-my-claudecode
/oh-my-claudecode:omc-setup

# agentation Official Skill (recommended for UI annotation)
npx skills add benjitaylor/agentation -g
# Then in conversation: /agentation
```

> **TOON Format**: `~/.claude/hooks/toon-inject.mjs` injects the skill catalog into every prompt (40–50% token savings). `~/.gemini/hooks/toon-skill-inject.sh` loads it via `includeDirectories`.
> [Official Gemini Hooks Guide](https://developers.googleblog.com/tailor-gemini-cli-to-your-workflow-with-hooks/)

---

## Step 4 — Verification

```bash
SKILLS_ROOT="$HOME/.agents/skills"
REPO_URL="https://github.com/akillness/oh-my-skills"

# Core skill check
echo ""
echo "=== Core Skill Check ==="
for skill in jeo omc ohmg omx ralph ralphmode plannotator agentation bmad survey harness; do
  [ -f "$SKILLS_ROOT/$skill/SKILL.md" ] \
    && echo "✅ $skill" \
    || echo "❌ $skill — re-run: skills add -g $REPO_URL --skill $skill --yes --copy"
done

# Platform dedup check
echo ""
echo "=== Platform Dedup Check ==="
check_no_dup() {
  local skill="$1" agent_dir="$2" agent_name="$3"
  [ -e "$agent_dir/$skill" ] && echo "⚠️  $skill found on $agent_name (should not be there)"
}
check_no_dup "omc"  "$HOME/.gemini/skills"          "gemini-cli"
check_no_dup "omc"  "$HOME/.codex/skills"            "codex"
check_no_dup "omc"  "$HOME/.config/opencode/skills"  "opencode"
check_no_dup "ohmg" "$HOME/.claude/skills"           "claude-code"
check_no_dup "ohmg" "$HOME/.codex/skills"            "codex"
echo "✅ Platform dedup verified"

# Preservation check
if [ -f /tmp/skills_before.txt ] && [ -s /tmp/skills_before.txt ]; then
  echo ""
  echo "=== Preservation Check ==="
  ls "$SKILLS_ROOT" 2>/dev/null | sort > /tmp/skills_after.txt
  MISSING=$(comm -23 /tmp/skills_before.txt /tmp/skills_after.txt)
  if [ -z "$MISSING" ]; then
    echo "✅ All pre-existing skills preserved — nothing was removed"
  else
    echo "⚠️  Missing skills (were present before):"
    echo "$MISSING"
    echo "Restore: skills add -g <source> --skill <name> --yes --copy"
  fi
  rm -f /tmp/skills_before.txt /tmp/skills_after.txt
fi

# Final count
echo ""
TOTAL=$(ls "$SKILLS_ROOT" 2>/dev/null | wc -l | tr -d ' ')
echo "=== Installation Complete: $TOTAL skills installed ==="
```

First run after installation:

| Platform | Command |
|----------|---------|
| Claude Code | `jeo "task description"` or `/oh-my-claudecode:team "task"` |
| Gemini CLI | `/jeo "task description"` |
| Codex CLI | `/jeo "task description"` |
| OpenCode | `/jeo "task description"` |

---

## Step 5 — GitHub Star (Consent-First)

> **For AI Agents**: Check `gh` auth status, then ask the user **once**. Execute only on consent. Never re-ask in the same session.

```bash
STAR_GUARD="$HOME/.omc/state/oh-my-skills-star-prompted"
STAR_REPO="akillness/oh-my-skills"

if [ -f "$STAR_GUARD" ]; then
  echo "(star prompt already shown — skipping)"
else
  mkdir -p "$(dirname "$STAR_GUARD")"

  if ! command -v gh &>/dev/null; then
    echo "gh CLI not found. To star later: brew install gh && gh auth login"
    echo "  gh api --method PUT /user/starred/$STAR_REPO"
    touch "$STAR_GUARD"

  elif ! gh auth status &>/dev/null 2>&1; then
    echo "gh CLI not authenticated. To star later: gh auth login"
    echo "  gh api --method PUT /user/starred/$STAR_REPO"
    touch "$STAR_GUARD"

  else
    if [ -t 0 ]; then
      read -p "Star $STAR_REPO? [Y/n] " -n 1 -r REPLY; echo ""
      if [[ -z "$REPLY" || "$REPLY" =~ ^[Yy]$ ]]; then
        gh api --silent --method PUT "/user/starred/$STAR_REPO" 2>/dev/null \
          && echo "⭐ Starred $STAR_REPO" \
          || echo "Star failed — try: gh api --method PUT /user/starred/$STAR_REPO"
      fi
    else
      echo "Run this to star: gh api --method PUT /user/starred/$STAR_REPO"
    fi
    touch "$STAR_GUARD"
  fi
fi
```

**For AI Agents**: After Step 4 succeeds, ask once:
> "Installation complete! Would you like to star the oh-my-skills repository? It helps the project grow."

If yes → `gh api --silent --method PUT /user/starred/akillness/oh-my-skills`
If no → skip silently. Never re-ask.

---

## Quick Reference

| Goal | Command |
|------|---------|
| Start any task | `jeo "task description"` |
| Claude orchestration | `autopilot: task` or `/oh-my-claudecode:team "task"` |
| Visual plan review | `plan` (plannotator keyword) |
| Spec-first dev loop | `ralph "build X"` or `ooo interview "X"` |
| Pre-impl research | `survey "topic"` |
| Agent team design | `harness "design team for X"` |
| UI annotation | `annotate` (agentation keyword) |
| Kanban board | `kanbanview` (vibe-kanban keyword) |
| Security scan | `strix --target ./app` |
| Web scraping | `scrapling "URL"` |
| Persistent wiki | `llm-wiki "/path/to/vault"` |
| Token output optimizer | `rtk gain` |

---

## Skill Inventory (89 skills)

| Category | Skills | Agent Target |
|----------|--------|--------------|
| **Core Orchestration** | jeo, ralph, plannotator, survey, harness, bmad, bmad-gds, bmad-idea, vibe-kanban, agentation, agent-browser | All (`*`) |
| **Platform Setup** | omc | claude-code |
| **Platform Setup** | ohmg | gemini-cli, antigravity |
| **Platform Setup** | omx | codex, claude-code, gemini-cli |
| **Platform Setup** | ralphmode | claude-code, codex, gemini-cli |
| **Planning & Review** | playwriter *(running-browser / authenticated Chrome reuse via CLI+MCP; route clean disposable checks to agent-browser)*, prompt-repetition, skill-standardization, skill-autoresearch | All (`*`) |
| **Backend** | api-design *(contract-first API design / compatibility review)*, api-documentation *(developer-facing API docs anchor for reference portals / quickstarts / SDK-webhook guides / truthful examples / auth-error guidance)*, authentication-setup *(product-auth setup router for hosted/framework-native/platform-native auth, sessions/JWTs, org data boundaries, and enterprise SSO handoff; routes hardening to security-best-practices)*, backend-testing *(backend coverage planning for API / integration / contract / fixture / CI-vs-local layers)*, database-schema-design *(storage-model and migration-safety design for relational/document schemas, constraints, indexes, and staged schema evolution; routes interface work to api-design and verification to backend-testing)* | All (`*`) |
| **Frontend** | design-system, frontend-design-system *(compatibility alias for design-system)*, react-best-practices, react-grab, vercel-react-best-practices *(compatibility alias for react-best-practices)*, responsive-design *(mobile-first / container-aware layout adaptation plus overflow and reflow verification)*, state-management *(React state-boundary / Context-vs-store / server-vs-client-state decision skill)*, ui-component-patterns *(reusable primitive / variant / slot API design for shared frontend components)*, web-accessibility *(accessibility audit/remediation plus manual-vs-automated verification guidance)*, web-design-guidelines *(broad web UI audit for launch-readiness, polish/consistency, flow-friction, heuristic, and rule-overlay reviews; routes accessibility-heavy work to web-accessibility and layout adaptation to responsive-design)* | All (`*`) |
| **Code Quality** | code-refactoring *(behavior-preserving structural cleanup for decomposition, duplication removal, reviewable slices, and repetitive migration / codemod planning; routes diagnosis to debugging, review judgment to code-review, test-policy design to testing-strategies, and measurement-led tuning to performance-optimization)*, code-review *(workflow-aware diff / PR review for correctness, risk, and missing evidence)*, debugging *(reproduce → isolate → verify root-cause workflow; routes raw symptom triage to log-analysis)*, performance-optimization *(measurement-led bottleneck analysis and tuning across interaction, API, DB, capacity, memory, bundle, and runtime/frame-budget work; routes telemetry setup to monitoring-observability and engine-specific capture interpretation to game-performance-profiler)*, testing-strategies *(risk-based validation policy for test layers, merge/release gates, and flaky-suite rules)* | All (`*`) |
| **Infrastructure** | deployment-automation *(release-execution anchor for preview/staging/prod promotion, rollout strategy, post-deploy verification, and rollback planning; routes CI workflow authoring to workflow-automation, machine setup to system-environment-setup, and long-lived telemetry to monitoring-observability)*, environment-setup *(app-config compatibility alias; routes broader runnable-machine setup to system-environment-setup)*, firebase-ai-logic *(direct Firebase app/client SDK lane for Gemini-powered in-app features; routes backend orchestration to genkit)*, firebase-cli, genkit *(full-stack backend AI workflow layer for flows, tools, RAG, evals, observability, and deployment; routes direct app SDK work to firebase-ai-logic)*, looker-studio-bigquery *(BigQuery-backed stakeholder dashboard/reporting layer for KPI boards, PM/ops reviews, marketing/GTM reporting, and game/business telemetry; routes KPI interpretation to data-analysis, repeated anomaly hunting to pattern-detection, and telemetry/alerting coverage to monitoring-observability)*, monitoring-observability *(telemetry design/review anchor for service reliability, instrumentation foundations, data-pipeline freshness/schema coverage, alert/dashboard audits, and game live-ops visibility; routes root-cause log forensics to log-analysis and bottleneck diagnosis to performance-optimization / game-performance-profiler)*, scrapling, rtk, security-best-practices *(layered web/API hardening anchor for headers/CSP, session-cookie/CSRF safety, abuse controls, secret handling, and verification handoffs; routes auth-stack choice to authentication-setup and test-layer design to backend-testing)*, strix, system-environment-setup *(canonical broader environment-setup skill)*, vercel-deploy *(Vercel-specific preview/prod deploy, promotion, alias/domain, env-sync, and rollback operations; routes generic rollout strategy to deployment-automation and CI YAML authoring to workflow-automation)* | All (`*`) |
| **Documentation** | changelog-maintenance *(release-history / release-notes anchor for `CHANGELOG.md`, migration updates, customer/dev release notes, and lightweight game patch notes; routes rollout execution to deployment-automation, launch messaging to marketing-automation, internal specs/runbooks to technical-writing, API portals to api-documentation, and end-user tutorials to user-guide-writing)*, presentation-builder *(deck artifact anchor for investor / roadmap / launch / architecture-demo / workshop / game-pitch decks with slides-grab review and PPTX/PDF handoff; routes long-form docs to technical-writing, tutorials to user-guide-writing, research manuscripts to research-paper-writing, and non-deck GTM planning to marketing-automation)*, research-paper-writing, technical-writing *(internal technical docs anchor for specs / architecture docs / ADRs / runbooks / migration guides; routes API portals to api-documentation, end-user tutorials to user-guide-writing, and release-note hygiene to changelog-maintenance)*, user-guide-writing *(customer-facing docs anchor for onboarding guides / tutorials / task-based how-to articles / FAQs / help-center updates; routes internal docs to technical-writing, API docs to api-documentation, and release-note hygiene to changelog-maintenance)* | All (`*`) |
| **Project Management** | sprint-retrospective, standup-meeting, task-estimation, task-planning | All (`*`) |
| **Search & Analysis** | autoresearch, codebase-search *(evidence-first repo navigation / call-site tracing / impact analysis before debugging or refactoring)*, data-analysis *(decision-first dataset analysis for exports, experiments, telemetry, cohort/funnel work, and stakeholder-ready evidence summaries; routes repeated anomaly hunting to pattern-detection and BI build-out to looker-studio-bigquery)*, langsmith, log-analysis, pattern-detection *(mode-selecting pattern/rule hunting for reusable code scans, repeated log/event shapes, and first-pass metric anomaly triage; routes root-cause forensics to log-analysis and stakeholder explanation to data-analysis)* | All (`*`) |
| **Creative Media** | remotion-video-production *(compatibility alias for video-production when legacy tooling or explicit Remotion naming still expects the old skill)*, video-production *(canonical programmable-video / automated-video production skill for Remotion, template APIs, content repurposing, and QA handoffs)* | All (`*`) |
| **Marketing** | marketing-automation, marketing-skills-collection *(compatibility alias for marketing-automation)* | All (`*`) |
| **Game Development** | game-build-log-triage *(Unity/Unreal build-log triage)*, game-ci-cd-pipeline *(game build/release pipeline design)*, game-demo-feedback-triage *(demo/playtest feedback synthesis)*, game-performance-profiler *(Unity/Unreal performance evidence triage)*, steam-store-launch-ops *(Steam store/festival/wishlist/launch operations)* | All (`*`) |
| **Utilities** | clawteam, fabric, file-organization *(repo structure decisions: framework defaults vs feature folders vs monorepo boundaries vs docs taxonomy vs engine-aware game layouts)*, git-submodule *(submodule-vs-subtree/vendor choice, recursive bootstrap, pointer updates, detached-HEAD handling, and CI checkout/auth)*, git-workflow, google-workspace, llm-wiki, npm-git-install *(Git dependency / tarball / workspace / publish-first choice)*, obsidian-cli, obsidian-plugin, opencontext *(project/repo memory + cross-agent handoff via searchable decisions, manifests, and stable links; routes long-lived wiki building to llm-wiki and structure mapping to graphify)*, workflow-automation *(repo task runners / bootstrap / local-CI automation)* | All (`*`) |

---

## Core Skill Keyword Reference

| Skill | Activation Keyword | Description |
|-------|-------------------|-------------|
| `jeo` | `jeo` | Integrated orchestration with `.jeo` ledger — Plan→Execute→Verify→Cleanup. Requires `plannotator` + `agentation`. **Claude Code**: requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` |
| `omc` | `omc`, `autopilot`, `ralph`, `ulw`, `ccg`, `deep interview`, `deslop`, `cancelomc` | Claude Code multi-agent orchestration (v4.9.3, 29+ agents) — Teams/Autopilot/Ralph/Ultrawork/CCG |
| `ralph` | `ralph`, `ooo`, `ooo ralph`, `ooo interview` | Ouroboros spec-first development — Interview→Seed→Execute→Evaluate→Evolve + persistent loop |
| `ralphmode` | `ralphmode` | Automation permission profiles — repo boundary, sandbox-first, secret denylist |
| `plannotator` | `plan` | Visual approval gate for agent plans/diffs — annotate, approve, request changes, or save reviewed plans |
| `harness` | `harness`, `build a harness`, `agent team architect` | Meta-skill: design domain-specific agent teams, generate `.claude/agents/` + `.claude/skills/`, validate harness |
| `survey` | `survey` | Cross-platform landscape scan before planning or implementation, with an explicit evidence-recovery ladder for broken search/extract runs |
| `agentation` | `annotate`, `UI검토`, `agentui` | Exact rendered-UI feedback router → choose copy-paste review, watch-loop sync, self-driving critique, or platform setup. MCP: `npx add-mcp "npx -y agentation-mcp server"` |
| `vibe-kanban` | `kanbanview` | Coding-task board/workspace control plane — parallel agents, review queues, worktree isolation, and PR handoff |
| `bmad` | `bmad`, `workflow-init`, `workflow-status` | Portable BMAD/BMM core router — choose project level, identify the current phase, recommend the next artifact, and route runtime-specific depth outward |
| `bmad-gds` | `bmad-gds` | Game-production orchestrator for ideas, GDDs, playtest notes, bugs, and launch beats |
| `bmad-idea` | `bmad-idea` | Pre-planning idea router for product, GTM, consulting, and game concepts → choose one framing mode and one concept artifact |
| `agent-browser` | `agent-browser` | Fresh-session browser verification anchor — choose a clean disposable browser, use snapshot refs, and prove before/after state with explicit evidence |
| `obsidian-cli` | `obsidian cli`, `obsidian terminal`, `obsidian plugin reload` | Official Obsidian CLI — TUI, vault/file targeting, note automation, plugin reload |
| `obsidian-plugin` | `obsidian plugin`, `create obsidian plugin` | Obsidian plugin development — 27 ESLint rules, boilerplate generator, accessibility |
| `llm-wiki` | `llm-wiki`, `obsidian wiki`, `research vault` | Persistent markdown wiki maintenance — bootstrap raw/wiki layers, ingest sources, file queries, run lint passes |
| `game-build-log-triage` | `game build log`, `unity build failed`, `unreal packaging error` | Unity/Unreal build/editor/package log triage — isolate the first actionable engine/build failure |
| `game-ci-cd-pipeline` | `game ci`, `unity build pipeline`, `unreal release pipeline` | Game CI/CD architecture — build matrices, artifacts, cache policy, packaging stages, and release gates |
| `game-demo-feedback-triage` | `playtest feedback`, `demo feedback`, `steam feedback triage` | Cluster demo/playtest/community feedback into fix-first priorities and explicit handoffs |
| `game-performance-profiler` | `frame time`, `unity profiler`, `unreal insights` | Interpret Unity/Unreal performance evidence and produce bottleneck-first next actions |
| `steam-store-launch-ops` | `steam launch`, `steam page`, `wishlist funnel` | Steam store-page, festival, demo, and launch-readiness operations |
| `clawteam` | `clawteam`, `agent swarm`, `spawn agents` | Framework-agnostic multi-agent CLI — file-based state, task queues, inboxes, kanban |
| `autoresearch` | `autoresearch`, `autonomous ml experiments`, `val_bpb` | Karpathy autonomous ML — overnight GPU experiments, ratchets improvements via git |
| `skill-autoresearch` | `skill-autoresearch`, `optimize this skill`, `eval my skill` | Eval-driven SKILL.md optimization — benchmark, mutate, keep only score-improving changes |
| `scrapling` | `scrapling`, `adaptive scraping`, `stealthy fetch` | Adaptive web scraping — parser-first HTML, fetcher escalation, CLI extraction, MCP/spider |
| `rtk` | `rtk`, `rust token killer`, `rtk init`, `rtk gain` | RTK install and agent integration — verify correct package, choose init mode, and use compact shell wrappers |
| `strix` | `strix`, `ai pentest`, `vulnerability scan cli` | AI-driven appsec testing — Docker sandbox, LLM provider, local/GitHub/live scans, CI/CD |
| `research-paper-writing` | `research paper`, `academic paper` | ML/CV/NLP academic paper — Abstract/Introduction/Method/Experiments/Conclusion |
| `omx` | `omx`, `$plan`, `$ralph`, `$team`, `$deep-interview`, `$ralplan` | Codex CLI multi-agent workflow layer (v0.11.10, 30+ agents) — team runtime, explore, sparkshell |
| `ohmg` | `ohmg`, `oh-my-agent`, `oma`, `.agents` | Gemini / Antigravity entry for the portable `oh-my-agent` harness |

---

> Full skill list → [README.md](README.md) · Korean guide → [README.ko.md](README.ko.md)
