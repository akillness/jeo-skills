# Solutions

## ClawTeam
- **What it is:** a CLI-first swarm runtime where a leader spawns workers, each worker gets its own git worktree/tmux window/identity, workers coordinate through `task` + `inbox`, and humans monitor through `board attach` or `board serve` rather than writing orchestration code. Source: [ClawTeam README](https://github.com/HKUDS/ClawTeam/blob/main/README.md).
- **Distinctive surface versus nearby tools:** explicit **team/task/inbox/worktree** state, mixed-agent CLI support (Claude Code, Codex, any CLI), tmux/subprocess backends, templates, and provider profiles. This is more opinionated and more operational than generic agent frameworks. Sources: [ClawTeam README](https://github.com/HKUDS/ClawTeam/blob/main/README.md), [oh-my-skills clawteam SKILL](https://github.com/HKUDS/ClawTeam).
- **Repeated complaints / risks already visible upstream:**
  - runtime persistence is fragile in some flows: workers can exit after first turn instead of acting like durable daemons ([issue #148](https://github.com/HKUDS/ClawTeam/issues/148))
  - config/agent-definition promises can outrun actual runtime behavior ([issue #146](https://github.com/HKUDS/ClawTeam/issues/146))
  - governance/isolation questions remain open around inbox spoofing, worktree contamination, and leader trust ([issue #76](https://github.com/HKUDS/ClawTeam/issues/76))
- **Implication for `oh-my-skills`:** `clawteam` already points at a genuinely distinct runtime. The evidence argues for a **tighter packet/front door around the real ClawTeam operator surface**, not a second wrapper skill that would blur the boundary.

## Nearby category: coding-agent boards / app shells

### OpenHands
- **What it is:** an AI-driven development platform split across SDK, CLI, and Local GUI; positioned more like a Devin/Jules-style coding agent shell than a swarm runtime. Source: [OpenHands README](https://github.com/OpenHands/OpenHands/blob/main/README.md).
- **How it differs from ClawTeam:** OpenHands centers on a coding agent session and GUI/runtime experience; ClawTeam centers on **leader-worker swarms with explicit task/inbox/worktree coordination**.
- **Repeated complaints / risks:**
  - loops / non-terminating bad runs in Docker GUI sessions ([issue #13942](https://github.com/OpenHands/OpenHands/issues/13942))
  - settings/state loss in the UI layer, including MCP settings resets ([issue #13975](https://github.com/OpenHands/OpenHands/issues/13975))
  - agent drift/hallucinated follow-on work after task completion ([issue #13862](https://github.com/OpenHands/OpenHands/issues/13862))
- **Implication:** if the need is “GUI coding agent with session management,” that is a different lane. It does **not** remove the need for a ClawTeam-specific routing skill.

## Nearby category: generic orchestration wrappers / frameworks

### CrewAI
- **What it is:** a Python framework for multi-agent automation built around **Crews** and **Flows**. Source: [CrewAI README](https://github.com/crewAIInc/crewAI/blob/main/README.md).
- **How it differs from ClawTeam:** CrewAI is a programmable framework for roles/tasks/flows; ClawTeam is an operator-facing runtime with team/task/inbox/worktree commands and board monitoring.
- **Repeated complaints / risks:**
  - loop detection is still an open reliability concern in autonomous runs ([issue #4682](https://github.com/crewAIInc/crewAI/issues/4682))
  - telemetry/memory integration can break initialization ([issue #4703](https://github.com/crewAIInc/crewAI/issues/4703))
  - streaming lacks task metadata, weakening observability ([issue #4347](https://github.com/crewAIInc/crewAI/issues/4347))
  - dependency footprint can be heavier than needed, including install failures for memory-related dependencies ([issue #5327](https://github.com/crewAIInc/crewAI/issues/5327))
- **Implication:** CrewAI already fills the “generic orchestration wrapper” slot. Adding another wrapper around ClawTeam would likely recreate the same abstraction overlap users already complain about elsewhere.

### AutoGen
- **What it is:** a multi-agent framework, now explicitly in **maintenance mode**, with Microsoft Agent Framework positioned as the successor. Source: [AutoGen README](https://github.com/microsoft/autogen/blob/main/README.md).
- **How it differs from ClawTeam:** AutoGen is a framework/API layer for multi-agent applications; ClawTeam is a concrete swarm runtime for CLI agents and worktree-isolated operator workflows.
- **Repeated complaints / risks:**
  - observability, usage, and cost tracking remain a named umbrella issue ([issue #5620](https://github.com/microsoft/autogen/issues/5620))
  - memory remains proposal-heavy rather than fully settled ([issue #4564](https://github.com/microsoft/autogen/issues/4564))
  - local code execution safety is an open security concern without sandboxing ([issue #7462](https://github.com/microsoft/autogen/issues/7462))
- **Implication:** AutoGen is evidence that broad framework layers tend to accumulate migration, observability, and safety concerns. That supports keeping `clawteam` narrowly truthful to upstream runtime operations.

### OpenAI Swarm
- **What it is:** an **experimental, educational** coordination library centered on agents + handoffs; the README explicitly recommends the production-ready Agents SDK instead. Source: [Swarm README](https://github.com/openai/swarm/blob/main/README.md).
- **How it differs from ClawTeam:** Swarm is intentionally lightweight and stateless; ClawTeam owns persistence-like operator surfaces (teams, inboxes, tasks, workspaces, boards) even if some durability is imperfect.
- **Repeated complaints / risks:**
  - official README says it is not the production path and is stateless between calls ([README](https://github.com/openai/swarm/blob/main/README.md))
  - users request external persistence layers because handoff state disappears when the process dies ([issue #70](https://github.com/openai/swarm/issues/70))
- **Implication:** this is the clearest example of a generic wrapper that is too thin for ClawTeam’s operator job. It reinforces “tighten the existing ClawTeam skill” over “add another generic wrapper.”

# Frequency Ranking

Ranked by how often the complaint theme recurred across the curated upstream docs/issues above.

1. **Reliability / loop / persistence failures** — **5 mentions**
   - ClawTeam worker exits ([#148](https://github.com/HKUDS/ClawTeam/issues/148))
   - OpenHands Docker loop ([#13942](https://github.com/OpenHands/OpenHands/issues/13942))
   - OpenHands post-task drift ([#13862](https://github.com/OpenHands/OpenHands/issues/13862))
   - CrewAI loop-detection request ([#4682](https://github.com/crewAIInc/crewAI/issues/4682))
   - Swarm persistence gap ([#70](https://github.com/openai/swarm/issues/70))

2. **Observability / state visibility / metadata gaps** — **5 mentions**
   - ClawTeam agent definitions parsed but not applied ([#146](https://github.com/HKUDS/ClawTeam/issues/146))
   - OpenHands settings/state lost ([#13975](https://github.com/OpenHands/OpenHands/issues/13975))
   - CrewAI streaming missing task metadata ([#4347](https://github.com/crewAIInc/crewAI/issues/4347))
   - CrewAI telemetry failure with memory backends ([#4703](https://github.com/crewAIInc/crewAI/issues/4703))
   - AutoGen observability umbrella issue ([#5620](https://github.com/microsoft/autogen/issues/5620))

3. **Setup / runtime / dependency burden** — **3 mentions**
   - ClawTeam still requires backend/runtime/profile choices ([README](https://github.com/HKUDS/ClawTeam/blob/main/README.md))
   - OpenHands Docker/runtime path can be fragile ([#13942](https://github.com/OpenHands/OpenHands/issues/13942))
   - CrewAI dependency/install friction ([#5327](https://github.com/crewAIInc/crewAI/issues/5327))

4. **Security / governance / trust boundaries** — **2 mentions**
   - ClawTeam inbox/worktree/delegation trust questions ([#76](https://github.com/HKUDS/ClawTeam/issues/76))
   - AutoGen unsandboxed local code execution concern ([#7462](https://github.com/microsoft/autogen/issues/7462))

5. **Thin-wrapper / product-boundary ambiguity** — **2 mentions**
   - AutoGen maintenance-mode / successor migration boundary ([README](https://github.com/microsoft/autogen/blob/main/README.md))
   - Swarm explicitly educational/stateless, not the production answer ([README](https://github.com/openai/swarm/blob/main/README.md))

**Bottom line:** the recurring pain is not “we need yet another orchestration wrapper.” It is “users need clearer truth about runtime mode, persistence limits, observability, and route-outs.” That favors another tightening pass on `clawteam` itself.

# Categories

## 1) Team / task / inbox / worktree swarms
- **Primary example:** ClawTeam
- **User promise:** leader-worker teams, explicit ownership, worktree isolation, inbox/task state, board visibility
- **Main differentiation:** operational swarm runtime for CLI agents, not just a framework API
- **Main recurring complaints:** worker persistence, config drift, trust/isolation

## 2) Coding-agent boards / app shells
- **Primary example:** OpenHands
- **User promise:** coding-agent session, GUI/CLI/SDK surfaces, agentic software development workflow
- **Main differentiation:** app shell/session manager, not explicit swarm state primitives
- **Main recurring complaints:** loops, state resets, hallucinated extra work

## 3) Generic orchestration wrappers
- **Examples:** CrewAI, AutoGen, OpenAI Swarm
- **User promise:** reusable multi-agent abstractions, roles/handoffs/flows, programmable coordination
- **Main differentiation:** developer frameworks rather than a ClawTeam-style operator runtime
- **Main recurring complaints:** framework overlap, observability gaps, persistence/memory complexity, dependency burden, unclear production boundary

## Decision signal for next ratchet
- Keep `clawteam` because **its object of control is still unique**: real ClawTeam teams, workers, tasks, inboxes, worktrees, templates, board commands, and profiles.
- Tighten the skill around the **highest-friction truths** users actually need up front:
  1. choose the mode first
  2. verify underlying agent CLI/runtime first
  3. be explicit about tmux vs subprocess and persistence limits
  4. route generic framework comparisons and board-only workflows outward
- Avoid a new wrapper skill unless it owns a truly different object than ClawTeam runtime control.

# Curated Sources

## ClawTeam
- Official repo / README: https://github.com/HKUDS/ClawTeam
- Worker persistence issue: https://github.com/HKUDS/ClawTeam/issues/148
- Agent definitions not applied: https://github.com/HKUDS/ClawTeam/issues/146
- Security / inbox-worktree trust questions: https://github.com/HKUDS/ClawTeam/issues/76
- Local skill context: /Users/jang_jennie/projects/oh-my-skills/.agent-skills/clawteam/SKILL.md

## OpenHands
- Official repo / README: https://github.com/OpenHands/OpenHands
- Docker loop bug: https://github.com/OpenHands/OpenHands/issues/13942
- MCP settings loss bug: https://github.com/OpenHands/OpenHands/issues/13975
- Hallucinated unrelated project bug: https://github.com/OpenHands/OpenHands/issues/13862

## CrewAI
- Official repo / README: https://github.com/crewAIInc/crewAI
- Loop detection request: https://github.com/crewAIInc/crewAI/issues/4682
- Telemetry + memory failure: https://github.com/crewAIInc/crewAI/issues/4703
- Streaming missing task metadata: https://github.com/crewAIInc/crewAI/issues/4347
- Install/dependency burden on Intel Mac: https://github.com/crewAIInc/crewAI/issues/5327

## AutoGen
- Official repo / README: https://github.com/microsoft/autogen
- Observability umbrella: https://github.com/microsoft/autogen/issues/5620
- Memory proposal: https://github.com/microsoft/autogen/issues/4564
- Unsandboxed local code execution concern: https://github.com/microsoft/autogen/issues/7462

## OpenAI Swarm
- Official repo / README: https://github.com/openai/swarm
- Persistence-gap example request: https://github.com/openai/swarm/issues/70
