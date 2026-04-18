# Platform Adapter and Artifact Contract for `survey`

Use this note when the survey topic involves agent tooling, hooks, permissions, or cross-platform orchestration.

## Why this reference exists
`survey` must stay portable across Claude / Codex / Gemini, but those platforms do **not** expose identical runtime features. The durable layer is the survey artifact contract, not the platform runtime.

## Common abstraction layer
Normalize vendor-specific behavior into three buckets:

- `settings` — model/config/project-level defaults, output mode, MCP enablement, approval defaults
- `rules` — allow/deny policy, instruction files, subagent boundaries, sandbox/approval posture
- `hooks` — pre/post/error callbacks, notification handlers, validation wrappers, lifecycle automation

If a vendor feature maps cleanly into one of these, do not describe it as a one-off concept.

## Portable baseline
Treat this as the portability floor:

1. **Repo-local instructions are the source of truth**
   - Keep survey behavior in checked-in markdown or skill files.
   - Do not duplicate the whole survey rubric into per-platform config blobs.

2. **Assume least privilege**
   - The survey should still work in read-only or approval-heavy environments.
   - Prefer one deterministic final write of the artifact files.

3. **Hooks are optional accelerators**
   - Claude and Gemini have richer hook systems than the Codex docs in scope here.
   - Validation must still be runnable as an ordinary post-generation step when no hook parity exists.

4. **Subagents improve execution, not artifact shape**
   - Claude and Gemini both have strong subagent stories.
   - Codex portability should not depend on first-class subagents.
   - The 4-lane structure still matters, but the filenames and section headings must stay identical even when the runtime differs.

5. **Project settings may be missing or untrusted**
   - Project-local config is useful, but the survey skill should not break when it is absent, ignored, or considered untrusted.

## Artifact contract
Keep the same files everywhere:

```text
.survey/{slug}/
├── triage.md
├── context.md
├── solutions.md
└── platform-map.md   # only when the topic is platform/tooling related
```

Keep the same headings everywhere:
- `triage.md` → `# Triage`
- `context.md` → `## Workflow Context`, `## Affected Users`, `## Current Workarounds`, `## Adjacent Problems`, `## User Voices`
- `solutions.md` → `## Solution List`, `## Categories`, `## What People Actually Use`, `## Frequency Ranking`, `## Key Gaps`, `## Contradictions`, `## Key Insight`
- `platform-map.md` → `## Settings`, `## Rules`, `## Hooks`, `## Platform Gaps`

Do not let platform-native output modes replace the markdown artifact schema.

## Platform notes

### Claude
- Strong project-level settings and hook surfaces.
- Subagents are a first-class way to run specialized lanes.
- Good fit for parallel lanes and hook-backed validation.
- Still keep the artifact contract in repo-local instructions, not only in `.claude/` config.

### Codex
- Treat config/instruction files, sandbox mode, approvals, and MCP settings as the main documented portability surface.
- Do not rely on hook parity or undocumented subagent behavior.
- The artifact contract must survive plain instruction-file execution.

### Gemini
- Strong settings layering, subagents, and command-based hooks.
- Good fit for lane specialization and post-generation validation.
- Still keep the markdown artifact schema explicit instead of assuming JSON output mode solves portability.

## Recommended validation pattern
Use the same validation logic everywhere:
1. create the artifact files
2. check required headings and filenames
3. check citations / provenance labels exist where needed
4. verify that platform-map files use the `settings / rules / hooks` layer for platform topics

Default repo-local validator:
```bash
python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/<slug>
python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/<slug> --platform-topic
```

If a platform supports hooks, wrap the validator there.
If it does not, run the validator as a normal command after writing files.

## Anti-patterns
- Putting the only copy of survey behavior in platform-specific settings
- Using hook-specific magic as if all platforms support it
- Letting a platform-native output mode replace the markdown artifact contract
- Expanding platform-map into vendor trivia that does not map back to `settings`, `rules`, or `hooks`
- Treating thin evidence as if it were direct primary-source verification
