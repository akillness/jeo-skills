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

# Install ALL 90 skills to global store, link shared skills to all detected agents
# Platform-specific skills (omc, ohmg, omx, ralphmode) are re-targeted in Step 2
skills add -g "$REPO_URL" --skill '*' -a '*' --yes --copy
```

> **jeo**: Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` on Claude Code. Creates a resumable `.jeo/` ledger (long-term.md, short-term.md, planned.md, progress.md, history.md) plus `.omc/state/jeo-state.json` for durable workflow state across planning, execution, QA, and cleanup.
>
> **agentation MCP**: `npx add-mcp "npx -y agentation-mcp server"` — auto-detects 9+ agents.
> **agentation Claude Code Official Skill**: `npx skills add benjitaylor/agentation -g` → `/agentation` in conversation.
>
> **presentation-builder**: Requires Node.js 18+, `npx playwright install chromium`, and `slides-grab --help` before first use. Best for real deck artifacts (investor / roadmap / launch / architecture-demo / workshop / game-pitch) when you need one chosen deck mode, one smallest useful artifact packet, and one honest last-mile surface (HTML review, PPTX, PDF, Google Slides, or Figma Slides).

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

# ralphmode — Claude Code, Codex CLI, Gemini CLI (repo-local settings + rules + hook checkpoints; not OpenCode)
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
# oh-my-claudecode plugin (optional — adds Claude Code slash skills; install the shell-side `omc` runtime separately when you truly need `omc ...` CLI commands)
/plugin marketplace add https://github.com/Yeachan-Heo/oh-my-claudecode
/plugin install oh-my-claudecode
setup omc

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
| Spec-first dev loop | `ralph "build X"` or `ooo interview "X"` *(portable method anchor; route runtime-native hook/approval setup to omc/omx/ohmg/ralphmode)* |
| Pre-impl research | `survey "topic"` *(writes reusable `.survey/{slug}/` artifacts and validates the artifact contract before handoff)* |
| Agent team design | `harness "design team for X"` |
| UI annotation | `annotate` (agentation keyword) |
| Kanban board | `kanbanview` (vibe-kanban keyword) |
| Security scan | `strix --target ./app` |
| Web scraping | `scrapling "URL"` |
| Persistent wiki | `llm-wiki "/path/to/vault"` |
| Token output optimizer | `rtk gain` |

---

## Skill Inventory (90 skills)

| Category | Skills | Agent Target |
|----------|--------|--------------|
| **Core Orchestration** | jeo, ralph, plannotator, survey, harness, bmad, bmad-gds, bmad-idea, vibe-kanban, agentation, agent-browser | All (`*`) |
| **Platform Setup** | omc | claude-code |
| **Platform Setup** | ohmg | gemini-cli, antigravity |
| **Platform Setup** | omx | codex, claude-code, gemini-cli |
| **Platform Setup** | ralphmode | claude-code, codex, gemini-cli |
| **Planning & Review** | playwriter *(running-browser / authenticated Chrome reuse via CLI+MCP; route clean disposable checks to agent-browser)*, prompt-repetition *(decision-first prompt repetition for non-reasoning/lightweight models on long-context retrieval, options-first MCQ, or position-sensitive lookups; route broader context/retrieval fixes away instead of blanket auto-apply)*, skill-standardization *(SKILL.md validate/rewrite + canonical-vs-alias cleanup + repo-root validator / derived-surface sync for `skills.json`, README/setup, and `SKILL.toon`)*, skill-autoresearch *(repo-local skill ratcheting loop: freeze evals, mutate one thing at a time, keep or revert by score, then sync support surfaces only when the core skill change is justified)* | All (`*`) |
| **Backend** | api-design *(contract-first API design / compatibility review)*, api-documentation *(developer-facing API docs anchor for reference portals / quickstarts / SDK-webhook guides / truthful examples / auth-error guidance)*, authentication-setup *(product-auth setup router for hosted/framework-native/platform-native auth, sessions/JWTs, org data boundaries, and enterprise SSO handoff; routes hardening to security-best-practices)*, backend-testing *(packet-first backend testing for coverage-plan, fixture/reset, contract/API protection, flake-stabilization, and local-vs-CI lane-split packets; routes policy to testing-strategies, API shape to api-design, and auth implementation to authentication-setup)*, database-schema-design *(packet-first storage-model and migration-safety design for relational/document/hybrid schemas, queryable-vs-flexible field decisions, and staged evolution; routes interface work to api-design, verification to backend-testing, and reporting/telemetry follow-through outward)* | All (`*`) |
| **Frontend** | design-system *(canonical UI-system anchor for token governance, visual-language rules, primitive naming, and cross-surface direction; routes component API design to ui-component-patterns, responsive layout to responsive-design, accessibility remediation to web-accessibility, and broad critique to web-design-guidelines)*, frontend-design-system *(compatibility alias for design-system)*, react-best-practices *(measurement-led React / Next.js performance audits for waterfalls, bundle size, hydration, rerender churn, and client-boundary mistakes)*, react-grab, vercel-react-best-practices *(compatibility alias for react-best-practices)*, responsive-design *(routing-first responsive layout strategy for page-shell, component-slot, dense-data, media, and reflow-verification packets; routes component API design to ui-component-patterns, accessibility remediation to web-accessibility, system-wide breakpoint policy to design-system, and broad UI critique to web-design-guidelines)*, state-management *(React/fullstack ownership-packet skill for local vs Context vs URL/form vs client-store vs server-state/router-data decisions)*, ui-component-patterns *(routing-first reusable-component architecture for primitive-boundary, slot-anatomy, controlled-ownership, alternate-root composition, and docs/verification packets)*, web-accessibility *(routing-first accessibility remediation and verification for semantics, keyboard/focus, labels/announcements, reflow, media alternatives, and routed-app feedback; routes broad UI critique to web-design-guidelines and layout strategy to responsive-design)*, web-design-guidelines *(broad web UI audit for launch-readiness, polish/consistency, flow-friction, heuristic, and rule-overlay reviews; routes accessibility-heavy work to web-accessibility and layout adaptation to responsive-design)* | All (`*`) |
| **Code Quality** | code-refactoring *(packet-first behavior-preserving cleanup for local refactors, fragile legacy freeze-first work, cleanup-heavy diff shaping, and repeated migration / codemod planning; routes diagnosis to debugging, review judgment to code-review, test-policy design to testing-strategies, bottleneck-led tuning to performance-optimization, and impact mapping to codebase-search)*, code-review *(evidence-first diff / PR review with severity, missing-proof checks, and route-outs for Git cleanup, debugging, UI critique, and repo-admin work)*, debugging *(routing-first diagnosis for concrete bugs, regressions, flaky failures, and env-specific behavior; routes symptom-first logs to log-analysis, broad test-policy work to testing-strategies, and perf-only work to performance-optimization)*, performance-optimization *(artifact-first measurement-led bottleneck analysis and tuning across traces, reports, query plans, benchmark diffs, CWV packets, and runtime/frame-budget work; routes telemetry setup to monitoring-observability and engine-specific capture interpretation to game-performance-profiler)*, testing-strategies *(packet-first validation-policy router for merge-gate truth, release-only proof, scheduled breadth, and incident-ratchet decisions; routes implementation to backend-testing, diagnosis to debugging, rollout execution to deployment-automation, game launch to steam-store-launch-ops / game-ci-cd-pipeline, accessibility-heavy validation to web-accessibility, and performance gate work to performance-optimization)* | All (`*`) |
| **Infrastructure** | deployment-automation *(release-execution anchor for preview releases, staging/prod promotion, rollout strategy, post-deploy verification, rollback response, and release hardening; routes CI workflow authoring to workflow-automation, machine setup to system-environment-setup, long-lived telemetry to monitoring-observability, and Vercel-specific linked-project deploy/promote/domain/env/rollback work to vercel-deploy)*, environment-setup *(app-config compatibility alias; routes broader runnable-machine setup to system-environment-setup)*, firebase-ai-logic *(direct Firebase app/client SDK lane for Gemini-powered in-app features; routes backend orchestration to genkit)*, firebase-cli *(Firebase platform/operator anchor for install/auth, bootstrap/config, Emulator Suite workflows, scoped deploy/release, App Hosting, and admin/data operations; routes backend AI workflow orchestration to genkit and direct app SDK integration to firebase-ai-logic)*, genkit *(packet-first backend AI workflow anchor for deciding whether a feature needs a reusable server-owned flow, Genkit eval/tracing, or a fallback to plain SDK routes / `survey`; routes direct app SDK work to firebase-ai-logic and Firebase operator tasks to firebase-cli)*, looker-studio-bigquery *(packet-first BigQuery dashboard/reporting lane for `dashboard-spec`, `slow-dashboard`, `refresh-shape`, `audience-split`, and `exec-handoff`; routes KPI interpretation to data-analysis, repeated anomaly hunting to pattern-detection, and telemetry/alerting coverage to monitoring-observability)*, monitoring-observability *(packet-first observability brief for service health, telemetry rollout, alert/dashboard audits, data-pipeline trust, and game live-ops visibility; routes root-cause log forensics to `log-analysis`, rollout execution to `deployment-automation`, and bottleneck diagnosis to `performance-optimization` / `game-performance-profiler`)*, scrapling, rtk, security-best-practices *(routing-first web/ap... [truncated]
| **Documentation** | changelog-maintenance *(routing-first release-history anchor for `CHANGELOG.md`, release notes, migration updates, and lightweight game patch-note packets; routes rollout execution to deployment-automation, launch messaging to marketing-automation, internal specs/runbooks to technical-writing, API portals to api-documentation, and end-user tutorials to user-guide-writing)*, presentation-builder *(packet-first deck artifact anchor for investor / roadmap / launch / architecture-demo / workshop / game-pitch decks; picks one deck mode, one smallest useful artifact packet, and one honest last-mile surface across HTML review, PPTX, PDF, Google Slides, or Figma Slides; routes docs/tutorials/research/non-deck GTM work outward)*, research-paper-writing, technical-writing *(internal technical docs anchor for specs / architecture docs / ADRs / runbooks / migration guides; routes API portals to api-documentation, end-user tutorials to user-guide-writing, and release-note hygiene to changelog-maintenance)*, user-guide-writing *(mode-selecting customer-docs anchor for onboarding guides / tutorials / task how-to articles / FAQs / help-center updates / release-help refresh packets; routes internal docs to technical-writing, API docs to api-documentation, and release-note hygiene to changelog-maintenance)* | All (`*`) |
| **Project Management** | sprint-retrospective *(routing-first retro anchor for sprint/milestone reflection, remote-hybrid facilitation, and dead-action-item recovery)*, standup-meeting *(routing-first coordination-cadence anchor that decides whether daily, async, hybrid, lighter, or no recurring standup is justified before choosing a standup mode)*, task-estimation *(routing-first estimate packet anchor for one sizing horizon, confidence/uncertainty framing, split-or-spike guidance, and cross-functional burden visibility; routes decomposition to `task-planning`, daily sync to `standup-meeting`, and process learning to `sprint-retrospective`)*, task-planning *(packet-first planning anchor for backlog cleanup, feature slicing, sprint/milestone prep, and release packets with explicit route-outs to estimation, boards, review, and pre-planning framing)* | All (`*`) |
| **Search & Analysis** | autoresearch *(Karpathy ML search front door for setup / program.md / bounded loop / results interpretation / constrained-hardware adaptation; preserves the immutable prepare.py / 300s / val_bpb contract and routes prompt-skill eval away)*, codebase-search *(routing-first repo navigation that chooses one search packet for definitions/references, config-content ownership, entry-point discovery, or impact mapping before debugging / refactoring / graphify)*, data-analysis *(decision-first dataset analysis for exports, experiments, telemetry, cohort/funnel work, and stakeholder-ready evidence summaries; routes repeated anomaly hunting to pattern-detection and BI build-out to looker-studio-bigquery)*, langsmith *(routing-first LangSmith packet selector for trace-debug, offline evals, review queues, prompt-registry ownership, and multi-service propagation before SDK code; routes generic dashboards/alerts to `monitoring-observability` and rollout work to `deployment-automation`)*, log-analysis *(routing-first log triage that chooses one evidence packet for app runtime, container/pod, browser+API, CI cascade, structured JSON, or security-signal work before debugging / observability / pattern-detection handoff)*, pattern-detection *(routing-first pattern/anomaly hunting that chooses text-prefilter, structural-code-rule, log-event-pattern, or metric-anomaly before suggesting tools or fixes; routes root-cause forensics to log-analysis, KPI explanation to data-analysis, remediation to specialist skills, and alert ops to monitoring-observability)* | All (`*`) |
| **Creative Media** | remotion-video-production *(compatibility alias for video-production when legacy tooling or explicit Remotion naming still expects the old skill)*, video-production *(canonical programmable-video / automated-video production skill for Remotion, template APIs, content repurposing, and QA handoffs)* | All (`*`) |
| **Marketing** | marketing-automation *(broad marketing front door for choosing one operating mode, one primary lane, and one reusable operator packet with owner, dependencies/approvals, and proof across launch, conversion, lifecycle, acquisition/content, and measurement work)*, marketing-skills-collection *(compatibility alias for marketing-automation)* | All (`*`) |
| **Game Development** | game-build-log-triage *(Unity/Unreal build-log triage)*, game-ci-cd-pipeline *(routing-first game pipeline packets for setup, stage split, cache policy, preflight, artifact/release hygiene, and CI signal)*, game-demo-feedback-triage *(demo/playtest feedback synthesis)*, game-performance-profiler *(Unity/Unreal frame-time triage: bottleneck-first profiling brief, quick packets, benchmark routes, target-device review, and deliberate profiler escalation)*, steam-store-launch-ops *(packet-first Steam launch router for page promise, wishlist signals, demo readiness, event timing workback, and launch-ops runbooks)* | All (`*`) |
| **Utilities** | clawteam, fabric *(routing-first Fabric operator skill for reusable stdin/file/transcript/log transforms, custom pattern packs, shell pipelines, and `fabric --serve`; not generic chat prompting or coding-assistant work)*, file-organization *(repo structure decisions: framework defaults vs feature folders vs monorepo boundaries vs docs taxonomy vs engine-aware game layouts)*, git-submodule *(submodule-vs-subtree/vendor/package delivery choice, recursive bootstrap, safe pointer sync/update, detached-HEAD handling, and CI / hosted-platform checkout limits)*, git-workflow *(routing-first local Git workflow: branch hygiene, selective staging, commit cleanup, merge-vs-rebase choice, conflict resolution, lease-safe pushes, and recovery)*, google-workspace *(choose Apps Script vs REST API vs Admin SDK, auth model, and multi-app Workspace workflow shape before implementation)*, graphify *(routing-first durable graph lane for assistant-native install vs local build vs refresh vs query vs structural fallback; routes search-first work to codebase-search and narrative/project memory outward)*, llm-wiki, npm-git-install *(routing-first Node package delivery: temporary Git bridge, SHA pin, private-auth, tarball/pack artifact, workspace/file inner-loop, or publish-first handoff)*, obsidian-cli *(routing-first Obsidian desktop automation: official CLI command/TUI mode, developer-command mode, official `obsidian://` handoff, and explicit headless/plugin-API route-outs)*, obsidian-plugin, opencontext *(routing-first active project/repo memory: choose memory-layer choice, load-context, search-context, store-conclusions, setup-integration, or repo-packer route-out for manifests, stable links, cross-agent handoff packets, and highest-confidence-source / freshness checks when notes overlap; routes wiki to llm-wiki and structure maps to graphify)*, workflow-automation *(routing-first repo workflow automation for task-entrypoints, bootstrap, local-CI parity, hook guardrail... [truncated]

---

## Core Skill Keyword Reference

| Skill | Activation Keyword | Description |
|-------|-------------------|-------------|
| `jeo` | `jeo` | Packet-first orchestration with `.jeo` ledger — plan gate → runtime handoff → verify → cleanup. Routes to `plannotator`, runtime skills, `agent-browser`, and `agentation` instead of owning their internals. **Claude Code**: requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` |
| `omc` | `omc`, `autopilot`, `ralph`, `ulw`, `ccg`, `/team`, `omc team`, `omc ask`, `cancelomc` | Claude-first OMC router — distinguish Claude Code slash skills from the `omc` shell CLI, then handle setup/recovery/state issues or route adjacent work outward |
| `ralph` | `ralph`, `ooo`, `ooo ralph`, `ooo interview` | Ouroboros spec-first method anchor — Interview→Seed→Execute→Evaluate→Evolve, immutable seed/spec, and persistent completion until verification passes |
| `ralphmode` | `ralphmode` | Automation permission profiles — repo boundary, sandbox-first, secret denylist |
| `plannotator` | `plan` | Routing-first visual approval gate for concrete plans, markdown specs, and diffs — choose one review packet, keep native-hook vs manual-review reality explicit, and route planning / PR policy / UI critique outward |
| `harness` | `harness`, `build a harness`, `agent team architect` | Meta-skill: design domain-specific agent teams, generate `.claude/agents/` + `.claude/skills/`, validate harness |
| `survey` | `survey` | Bounded cross-platform landscape scan before planning or implementation — classify one survey mode, preserve the 4-lane `.survey/{slug}/` artifact contract, and normalize platform topics as `settings/rules/hooks` |
| `agentation` | `annotate`, `UI검토`, `agentui` | Exact rendered-UI feedback router → choose copy-paste review, watch-loop sync, self-driving critique, or platform setup. MCP: `npx add-mcp "npx -y agentation-mcp server"` |
| `vibe-kanban` | `kanbanview` | Coding-board control plane — bounded coding cards, tracker-linked workspaces, review queues, worktree isolation, and PR handoff |
| `bmad` | `bmad`, `workflow-init`, `workflow-status` | Packet-first BMAD/BMM front door — classify the current packet, choose the next artifact or gate, and route runtime / review / execution detail outward |
| `bmad-gds` | `bmad-gds` | Game-production orchestrator for ideas, GDDs, playtest notes, bugs, and launch beats |
| `bmad-idea` | `bmad-idea` | Pre-planning idea router for product, GTM, consulting, and game concepts → choose one framing mode and one concept artifact |
| `agent-browser` | `agent-browser` | Fresh-session browser verification anchor — choose a clean disposable browser, use snapshot refs, and prove before/after state with explicit evidence |
| `obsidian-cli` | `obsidian cli`, `obsidian terminal`, `obsidian plugin reload`, `obsidian://` | Routing-first Obsidian desktop automation — official CLI command/TUI mode, developer commands, URI handoff, and explicit headless/plugin-API route-outs |
| `obsidian-plugin` | `obsidian plugin`, `create obsidian plugin` | Obsidian plugin development — 27 ESLint rules, boilerplate generator, accessibility |
| `llm-wiki` | `llm-wiki`, `obsidian wiki`, `research vault` | Persistent markdown wiki maintenance — bootstrap raw/wiki layers, ingest sources, file queries, run lint passes |
| `game-build-log-triage` | `game build log`, `unity build failed`, `unreal packaging error` | Unity/Unreal build/editor/package log triage — isolate the first actionable engine/build failure |
| `game-ci-cd-pipeline` | `game ci`, `unity build pipeline`, `unreal release pipeline` | Routing-first game CI/CD packets — setup, stage split, cache policy, preflight checks, artifact/release hygiene, and CI trust |
| `game-demo-feedback-triage` | `playtest feedback`, `demo feedback`, `steam feedback triage` | Cluster demo/playtest/community feedback into fix-first priorities and explicit handoffs |
| `game-performance-profiler` | `frame time`, `unity profiler`, `unreal insights` | Turn Unity/Unreal perf packets into one bottleneck-first profiling brief with next captures, benchmark routes, device review, and route-outs |
| `steam-store-launch-ops` | `steam launch`, `steam page`, `wishlist funnel` | Packet-first Steam launch router — choose page promise audit, wishlist signal check, demo readiness gate, event timing workback, or launch-ops runbook |
| `clawteam` | `clawteam`, `agent swarm`, `spawn agents` | Packet-first ClawTeam runtime router — choose manual-team, template-launch, monitor-recover, or profile-setup; route generic orchestration and board-governance outward |
| `autoresearch` | `autoresearch`, `autonomous ml experiments`, `val_bpb` | Karpathy autonomous ML front door — choose setup / `program.md` / bounded loop / results interpretation / constrained-hardware mode, preserve immutable `prepare.py` + 300s + `val_bpb`, not for prompt/skill eval |
| `skill-autoresearch` | `skill-autoresearch`, `optimize this skill`, `eval my skill` | Repo-local skill ratcheting — choose one packet (ratchet eligibility, readiness, charter, baseline, mutation, support-sync, or final report), allow `no ratchet justified`, freeze evals, keep or revert by score, and route hosted eval / ML autoresearch work outward |
| `scrapling` | `scrapling`, `adaptive scraping`, `stealthy fetch`, `selector drift` | Routing-first adaptive web scraping — choose parser-only, HTTP fetch, JS browser, stealth escalation, MCP, or spiders from one intake packet |
| `rtk` | `rtk`, `rust token killer`, `rtk init`, `rtk gain` | RTK install and agent integration — verify correct package, choose init mode, and use compact shell wrappers |
| `strix` | `strix`, `ai pentest`, `vulnerability scan cli` | AI-driven appsec testing — Docker sandbox, LLM provider, local/GitHub/live scans, CI/CD |
| `research-paper-writing` | `research paper`, `academic paper` | ML/CV/NLP paper + rebuttal workflow — abstract/introduction/method/experiments, figure-table support, reviewer response, camera-ready revision |
| `omx` | `omx`, `$plan`, `$ralph`, `$team`, `$deep-interview`, `$ralplan` | Codex CLI multi-agent workflow layer (v0.11.10, 30+ agents) — team runtime, explore, sparkshell |
| `ohmg` | `ohmg`, `oh-my-agent`, `oma`, `.agents` | Gemini / Antigravity entry for the portable `oh-my-agent` harness |

---

> Full skill list → [README.md](README.md) · Korean guide → [README.ko.md](README.ko.md)
