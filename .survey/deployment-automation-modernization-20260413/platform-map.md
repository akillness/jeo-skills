# Platform Map: deployment-automation modernization

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Execution mode | Strong project/user settings fit for deploy defaults and safety policy | Strong sandbox/approval settings fit for deploy execution policy | Good workspace settings, but usually thinner deploy-specific controls | `deployment.mode = dry-run | prepare | execute` |
| Target env/provider | Good place to encode default environment and provider assumptions | Good place to encode allowed provider/tool commands | Good place to encode preferred provider path and verification commands | `deployment.environment`, `deployment.provider` |
| Required preflight | Natural fit for required tests/build/clean-branch checks | Natural fit as approved command set + preflight command list | Natural fit as bounded project command expectations | `deployment.preflight.required` |
| Required verification | Strong fit, especially when coupled with hooks | Strong fit, usually via scripts or CI | Strong fit, usually via scripts or CI | `deployment.verify.required` |
| Rollback posture | Can express auto/manual rollback preference cleanly | Better expressed as allowed workflow + known script/CLI path | Better expressed as known script/CI path | `deployment.rollback.mode` |
| Production approval | Strong fit via settings + policy + hooks | Strong fit via approval/sandbox mode | Usually wrapper/CI-driven rather than deeply native | `deployment.production.requires_approval` |

Sources:
- Claude Code settings: https://docs.anthropic.com/en/docs/claude-code/settings
- OpenAI Codex repo/docs: https://github.com/openai/codex
- Gemini CLI repo/docs: https://github.com/google-gemini/gemini-cli

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Prod deploy safety | Best candidate for policy-enforced preflight + prod gating | Best enforced through approval mode and known commands | Best enforced through bounded scripts/CI handoff | Never deploy prod without explicit intent/policy |
| Secrets handling | Strong rule surface plus hookable redaction posture | Strong rule surface, but enforcement tends to be execution-policy based | Strong rule surface, but typically wrapper-dependent | Never print secrets; route secret governance outward |
| Scope boundary | Easy to encode route-outs to nearby skills | Easy to encode route-outs, but orchestration will live externally | Same | Route out to `workflow-automation`, `system-environment-setup`, `monitoring-observability`, `vercel-deploy`, and security skills when the task crosses that boundary |
| Post-deploy verification | Strong fit; can make it mandatory in process | Strong fit if the project already has check scripts | Strong fit if the project already has check scripts | Always verify after deploy |
| Unsafe shortcuts | Strong fit to block skipping tests or unsafe prod commands | Strong fit via sandbox/approval conventions | Strong fit via wrapper conventions | Never skip tests/health checks to “make deploy pass” |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Preflight | Native hooks are the best fit for enforced checks | Usually external script / task runner / CI job | Usually external script / task runner / CI job | Detect provider, target env, auth/tools, branch/state |
| Pre-deploy gate | Strong native hook candidate | Pseudo-hook through wrapper command or CI stage | Pseudo-hook through wrapper command or CI stage | Require approvals / tests / build / env checks |
| Post-deploy verify | Strong native hook candidate | Scripted smoke test / provider CLI follow-up | Scripted smoke test / provider CLI follow-up | Health check, smoke test, capture URL/version |
| Failure handling | Natural place for rollback guidance and redaction | Usually explicit rollback script or provider command | Usually explicit rollback script or provider command | Roll back or stop promotion on failed verification |
| Reporting | Strong hook or post-step summary | Script or CI summary | Script or CI summary | Summarize env, version, checks run, outcome |

Sources:
- Claude Code hooks: https://docs.anthropic.com/en/docs/claude-code/hooks
- OpenAI Codex repo/docs: https://github.com/openai/codex
- Gemini CLI repo/docs: https://github.com/google-gemini/gemini-cli

## Platform Gaps
- None of the agent platforms expose a universal deployment object or deployment-state model; deploy work still depends on project scripts, provider CLIs, APIs, or CI systems.
- Claude appears strongest for native lifecycle enforcement, but still needs project-defined provider/auth/release conventions.
- Codex and Gemini fit a thinner deployment skill better: detect → preflight → invoke known entrypoints → verify → report.
- The skill should avoid pretending it owns all DevOps concerns. It should stay focused on release execution and route out when the real task is CI workflow authoring, environment setup, observability architecture, provider-specific deep operations, or security/compliance design.

## Common route-outs
- **`workflow-automation`** when the task is mainly about authoring or refactoring CI/CD workflows, reusable pipelines, task runners, or repo-local release glue.
- **`system-environment-setup`** when the task is installing provider CLIs, SDKs, runtimes, Docker, kubectl, auth bootstrap, or machine setup.
- **`monitoring-observability`** when the task is dashboards, alerts, traces, log pipelines, SLOs, or incident telemetry rather than immediate post-deploy verification.
- **`vercel-deploy`** when the task is specifically Vercel linking, domains, aliases, preview/prod semantics, or Vercel environment settings.
- **Security skills** when the task is secret rotation, IAM scopes, supply-chain controls, compliance evidence, or audit architecture.

## Rewrite implication
The modernized skill should primarily own: detect deploy intent, choose environment/provider path, run preflight checks, invoke existing deploy entrypoints, perform immediate post-deploy verification, summarize the release, and route to adjacent skills whenever the task crosses into workflow authoring, machine setup, observability design, or provider/security specialization.

## Confidence note
This map uses direct source links and repo-maintenance synthesis because the run’s web search/extract tools returned authentication errors during the survey step.
