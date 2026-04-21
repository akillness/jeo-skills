# Lane C — Actual behavior for `omc`

## What People Actually Use

Operators do not appear to rely on a pure “just say the magic words” flow, despite upstream marketing like “Zero learning curve” and “Zero configuration required” in the upstream OMC README ([repo README](https://github.com/Yeachan-Heo/oh-my-claudecode)). In practice they use explicit setup, explicit commands, and adjacent control surfaces:

- **Explicit install + setup + settings edits.** Upstream OMC still requires plugin install, `/setup` or `omc setup`, and manual `~/.claude/settings.json` enablement for native teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`) ([upstream README](https://github.com/Yeachan-Heo/oh-my-claudecode)). The local `oh-my-skills` docs also present OMC as a platform-specific setup path, not a zero-config runtime ([local README](../../README.md), [local omc guide](../../docs/omc/README.md)).
- **Concrete commands over vague keywords.** Upstream docs distinguish `/team` vs `omc team` vs `/autopilot` and explicitly note that `autopilot`, `ralph`, and `ultrawork` are in-session skills, while `omc team` is a separate tmux runtime ([upstream README](https://github.com/Yeachan-Heo/oh-my-claudecode)). That separation suggests real operators learn the exact surface they need.
- **A mixed orchestration stack.** In this repo, OMC is already surrounded by adjacent specialist skills: `plannotator` for plan approval, `agent-browser` for fresh-session verification, `agentation` for rendered-UI feedback, `playwriter` for authenticated browser reuse, `ralph` for spec-first persistence, `ralphmode` for permission posture, and `jeo` for the longer ledgered delivery loop ([local README](../../README.md), [setup-all-skills-prompt.md](../../setup-all-skills-prompt.md)).
- **Routing-first task starts.** The local quick-start table already nudges users toward `jeo`, `plan`, `ralph`, `survey`, and `annotate` depending on the real job, instead of treating OMC as the only front door ([setup-all-skills-prompt.md](../../setup-all-skills-prompt.md)).

## Common Workarounds

- **Manual CLAUDE.md repair / doctor reruns.** When setup wrote the wrong `CLAUDE.md`, users fixed it by manually downloading the correct file or running `/oh-my-claudecode:omc-doctor` ([issue #1572](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/1572)).
- **Avoiding duplicate install paths.** Users hit duplicate slash commands when both the plugin and CLI/runtime installer were present, then had to choose one path or clean up manually ([issue #2252](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2252)). Upstream README now explicitly warns about `--plugin-dir-mode` for this class of problem ([upstream README](https://github.com/Yeachan-Heo/oh-my-claudecode)).
- **Deleting or pruning generated config/agent files.** `omc-setup` was reported to recreate legacy agent files under `~/.claude/agents/`, so users deleted duplicates and still saw them come back on rerun ([issue #1502](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/1502)).
- **Prompt-level overrides when routing loops go wrong.** When team/plan flows got stuck, users resorted to direct instructions like “do not perform any additional planning” to break the loop ([issue #2714](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2714)).
- **Fallback to manual state hygiene in persistent modes.** Persistent mode could misfire on resume because stale `.omc/state/` files survived across sessions, so state cleanup and careful resume behavior mattered in normal use ([issue #2693](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2693)).
- **Container/CI-specific compensations.** In ephemeral environments the HUD could loop on 429s because cached usage state was cold every launch; that is a classic sign that operators still need environment-aware fallback behavior, not just vendor-default automation ([issue #2695](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2695)).

## Pain Points With Current Solutions

- **“Zero config” claims do not match operator reality.** Native teams still require settings changes; plugin vs CLI/runtime surfaces differ; tmux worker flows need separate CLIs installed; and update/setup/doctor loops remain part of normal operation ([upstream README](https://github.com/Yeachan-Heo/oh-my-claudecode), [local omc guide](../../docs/omc/README.md)).
- **Too many overlapping surfaces create confusion.** `/team`, `omc team`, `/autopilot`, legacy `/omc-teams`, plugin slash skills, and generated local files can overlap or collide ([upstream README](https://github.com/Yeachan-Heo/oh-my-claudecode), [issue #2252](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2252), [issue #1502](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/1502)).
- **Persistence and resume remain brittle.** Real users report stale state, cancel-on-resume behavior, and planning loops rather than seamless “won’t stop until done” autonomy ([issue #2693](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2693), [issue #2714](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2714)).
- **Manual repo instructions still matter.** Claude Code users still report that canonical `CLAUDE.md` rules and skill overrides are ignored or only partially respected, which pushes teams back toward explicit repo instructions, approvals, and narrower task routing instead of trusting a magic keyword to preserve boundaries ([Claude Code issue #50701](https://github.com/anthropics/claude-code/issues/50701), [Claude Code issue #50631](https://github.com/anthropics/claude-code/issues/50631)).
- **This repo already reflects the healthier pattern.** The local maintenance direction says to prefer packet/route-out clarifications over more wrappers, and the orchestration cluster already distributes ownership across `omc`, `jeo`, `ralph`, `plannotator`, `agent-browser`, `agentation`, and `ralphmode` ([graph report](../../graphify-out/GRAPH_REPORT.md), [local README](../../README.md)).

## Sources

- Local repo: [`README.md`](../../README.md)
- Local repo: [`docs/omc/README.md`](../../docs/omc/README.md)
- Local repo: [`setup-all-skills-prompt.md`](../../setup-all-skills-prompt.md)
- Local repo: [`graphify-out/GRAPH_REPORT.md`](../../graphify-out/GRAPH_REPORT.md)
- Upstream docs: [Yeachan-Heo/oh-my-claudecode README](https://github.com/Yeachan-Heo/oh-my-claudecode)
- Upstream issues: [#1502](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/1502), [#1572](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/1572), [#2252](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2252), [#2693](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2693), [#2695](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2695), [#2714](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2714)
- Claude Code issues: [#50631](https://github.com/anthropics/claude-code/issues/50631), [#50701](https://github.com/anthropics/claude-code/issues/50701)
