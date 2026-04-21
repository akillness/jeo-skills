# Solution Landscape: ralph structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| `ralph` | Spec-first interview → seed → execute → evaluate → evolve plus persistent completion | Canonical method, strong trigger surface, portable across runtimes | Oversized front door; stale Codex wording in local docs | Best candidate for in-place hardening |
| `omc` | Claude-first orchestration runtime with Ralph as one guarantee mode | Strong native hooks and team runtime | Not the owner of portable spec-first method | Runtime-specific surface |
| `omx` | Codex-first orchestration runtime with `$plan`, `$ralph`, `$team` | Best place for Codex-native execution details | Should not replace `ralph` as method anchor | Runtime-specific surface |
| `ohmg` | Gemini / Antigravity harness source of truth | Clean portable harness boundary | Not a persistent-completion owner | Harness / projection layer |
| `jeo` | Integrated delivery router with ledgers and resumable phases | Excellent for end-to-end delivery | Heavy for simple "keep going until verified" jobs | Higher-level orchestrator |
| `ralphmode` | Approval / sandbox / permission profile layer | Clean safety boundary | Not a method or runtime skill | Guardrail layer |
| `skill-autoresearch` | Frozen-evaluator keep/revert loop for skill maintenance | Strong maintenance discipline | Not a runtime workflow | Useful meta-pattern, not replacement |
| `survey` | Research-first discovery scan before planning / implementation | Keeps landscape grounded | Intentionally not an execution surface | Support-only surface |

## Categories
- Spec-first core: `ralph`
- Runtime adapters: `omc`, `omx`, `ohmg`
- Integrated router: `jeo`
- Guardrails: `ralphmode`
- Research / maintenance support: `survey`, `skill-autoresearch`

## What People Actually Use
In practice, the local repo combines `ralph` with runtime-native wrappers rather than asking `ralph` to own every platform detail. Claude users lean on OMC hooks/team flows, Codex users use OMX and still keep fallback/manual patterns nearby, Gemini users rely on hooks/trust settings, and JEO handles full delivery ledgers when a plain persistent loop is not enough.

## Frequency Ranking
1. `ralph`
2. `jeo`
3. `omc`
4. `omx`
5. `ohmg`
6. `survey`
7. `ralphmode`
8. `skill-autoresearch`

Frequency note: ranking is based on repo-local mention counts across README/setup/core skill files gathered during this run, not user telemetry.

## Key Gaps
- `ralph` still carries too much runtime/setup detail in the front door instead of routing that detail into references and sibling runtime skills.
- Local Codex guidance still reads as compensation-only even though official Codex docs now expose native experimental hooks.
- Repo-local docs blur three different layers: spec-first method, runtime execution, and permission/trust posture.

## Contradictions
- Marketed claim: `ralph` is a portable method across runtimes.
- User reality: persistence and continuation still depend heavily on runtime-native hooks, trust settings, and approval controls.

- Marketed local claim: Codex is compensation-mode only.
- Current official-doc reality: Codex now has experimental native hooks plus first-class rules / approvals docs, even if fallback/manual patterns still matter.

## Key Insight
The best bounded move is not to add another orchestration wrapper. It is to harden `ralph` as the portable specification-first anchor, shrink the front door, move slower-changing runtime detail into references, and correct stale Codex platform guidance while preserving the route-outs to `omc`, `omx`, `ohmg`, `jeo`, and `ralphmode`.

## Curated Sources
- `.agent-skills/ralph/SKILL.md`
- `.agent-skills/jeo/SKILL.md`
- `.agent-skills/omc/SKILL.md`
- `.agent-skills/omx/SKILL.md`
- `.agent-skills/ohmg/SKILL.md`
- `.agent-skills/ralphmode/SKILL.md`
- `.agent-skills/skill-autoresearch/SKILL.md`
- `.agent-skills/survey/SKILL.md`
- `README.md`
- `setup-all-skills-prompt.md`
- <https://ghuntley.com/ralph/>
- <https://raw.githubusercontent.com/Q00/ouroboros/main/README.md>
- <https://developers.openai.com/codex/hooks>
- <https://developers.openai.com/codex/rules>
- <https://developers.openai.com/codex/agent-approvals-security>
- <https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/hooks/reference.md>
- <https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/cli/trusted-folders.md>
