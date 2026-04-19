# ClawTeam use cases

## 1. Fullstack feature split
Use `manual-team` when roles and dependencies matter.

```bash
clawteam team spawn-team shop -d "Ship invite flow" -n leader
clawteam spawn tmux claude --team shop --agent-name architect --task "Design invite API and schema"
clawteam spawn tmux claude --team shop --agent-name backend   --task "Implement invite endpoints"
clawteam spawn tmux codex  --team shop --agent-name tester    --task "Write integration tests"

clawteam task create shop "Design invite API and schema" -o architect
clawteam task create shop "Implement invite endpoints" -o backend
clawteam task create shop "Write integration tests" -o tester --blocked-by 2

clawteam board attach shop
```

## 2. Product / ops research swarm
Use `manual-team` when the team needs explicit parallel ownership with synthesis.

```bash
clawteam team spawn-team launch-research -d "Analyze onboarding friction and activation risks" -n leader
clawteam spawn tmux claude --team launch-research --agent-name user-research   --task "Summarize interview patterns"
clawteam spawn tmux claude --team launch-research --agent-name analytics       --task "Inspect funnel drop-offs"
clawteam spawn tmux codex  --team launch-research --agent-name synthesis       --task "Merge findings into one operator memo"

clawteam task create launch-research "Summarize interview patterns" -o user-research
clawteam task create launch-research "Inspect funnel drop-offs" -o analytics
clawteam task create launch-research "Merge findings into one memo" -o synthesis --blocked-by 1,2
```

## 3. Marketing / content studio
Use `manual-team` when content creation and QA can run in parallel but still need explicit review handoffs.

```bash
clawteam team spawn-team campaign -d "Ship launch-week content pack" -n lead
clawteam spawn tmux claude --team campaign --agent-name landing-page  --task "Draft landing page updates"
clawteam spawn tmux claude --team campaign --agent-name email-sequence --task "Draft launch emails"
clawteam spawn tmux codex  --team campaign --agent-name qa           --task "Check links, UTMs, and publishing checklist"

clawteam board serve --port 8080
```

## 4. Game / simulation milestone swarm
Use `manual-team` when code, content, QA, and distribution roles all matter.

```bash
clawteam team spawn-team demo-milestone -d "Prepare streamer-ready demo build" -n lead
clawteam spawn tmux claude --team demo-milestone --agent-name gameplay  --task "Polish tutorial and controller support"
clawteam spawn tmux claude --team demo-milestone --agent-name build      --task "Prepare and package the demo build"
clawteam spawn tmux codex  --team demo-milestone --agent-name qa         --task "Run smoke checks and capture release blockers"
```

## 5. One-command template launch
Use `launch-template` when the built-in archetype already fits.

```bash
clawteam template list
clawteam launch hedge-fund --team fund1 --goal "Analyze AAPL, MSFT, NVDA for Q2 2026"
clawteam board attach fund1
```

## 6. Provider-aware runtime setup
Use `profile-setup` when the runtime configuration is the actual blocker.

```bash
clawteam preset list
clawteam preset show moonshot-cn
clawteam preset generate-profile moonshot-cn claude --name claude-kimi
clawteam profile doctor claude
MOONSHOT_API_KEY=*** clawteam profile test claude-kimi
```

## Notes
- Prefer template launch when the archetype is already known.
- Prefer manual teams when dependencies, ownership, or mixed agents need to be explicit.
- Use monitoring commands (`board show/live/attach/serve`) as the verification path, not just raw spawn output.
