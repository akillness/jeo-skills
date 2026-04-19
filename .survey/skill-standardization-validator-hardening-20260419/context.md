# Context: Skill Standardization Validator Hardening

## Workflow Context
Routine skill maintenance in this repo depends on `SKILL.md` frontmatter checks during creation, rewrites, aliasing, and catalog-sync passes. The local validator currently flattens multiline descriptions with `awk ... | xargs`, so a whitespace-normalization step accidentally performs shell-style quote parsing. That matters because multiline descriptions are normal, not exotic: a repo-local scan found 82 live `SKILL.md` files using `description: >` or `description: |`, and 53 of those folded blocks already contain apostrophes, quotes, backticks, or shell-like text. In this repo, the failure mode is therefore part of ordinary maintenance, not an edge case.

Upstream evidence points the same way. Gemini CLI documents multiline `SKILL.md` descriptions in its skill-creation docs, while OpenAI's skills repo has already had to repair scaffold/validator mismatches because a generated `SKILL.md` failed validation immediately. Similar shell-parser breakage shows up outside skills too: Shipwright reported `xargs: unterminated quote` when a YAML field contained single quotes because `xargs` was being used as a whitespace trimmer instead of a parser.

Sources:
- Local primary-source inspection: `.agent-skills/skill-standardization/scripts/validate_skill.sh:131`
- Local repo scan across `.agent-skills/*/SKILL.md`
- https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/creating-skills.md
- https://github.com/openai/skills/pull/345
- https://github.com/ezigus/shipwright/issues/223

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Run `validate_skill.sh`, keep skill quality and discovery surfaces clean, gate PRs | Intermediate–advanced |
| Skill author | Write or rewrite `SKILL.md` descriptions with natural-language trigger wording | Intermediate |
| Agent maintenance loop | Use validation as a frozen evaluator before keeping or reverting changes | Advanced automation |
| Runtime/loader user | Expect valid skills to load and validate even with normal encoding or punctuation | Mixed |

Related evidence: Codex users have also reported parser fragility when valid `SKILL.md` files were saved with UTF-8 BOM, which shows that metadata parsing mistakes propagate to ordinary skill consumers, not just authors.

Sources:
- https://github.com/openai/codex/issues/13918
- https://github.com/openai/skills/pull/345
- https://github.com/google-gemini/gemini-cli/issues/21760

## Current Workarounds
1. Rewrite the description to remove apostrophes or shell-like snippets so `xargs` stops treating content as shell quoting.
2. Force descriptions onto a single line, which some validators explicitly require even though docs elsewhere show multiline YAML.
3. Keep shell parsing very shallow and avoid validating the folded description content at all.
4. Drop to a safer parser (`yq`, Python/PyYAML, `python-frontmatter`, `gray-matter`) when shell parsing becomes brittle.

Limitations:
- Author-side wording rewrites are not truthful fixes; they mutate valid prose to appease the parser.
- Single-line-only policies reduce readability and diverge from common skill docs.
- Shallow parsing misses useful validation signals.
- Switching the whole validator stack to a new dependency is a larger change than this run requires.

Sources:
- https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/skills/builtin/skill-creator/scripts/validate_skill.cjs
- https://github.com/mikefarah/yq
- https://pyyaml.org/wiki/PyYAMLDocumentation
- https://github.com/eyeseast/python-frontmatter

## Adjacent Problems
- UTF-8 BOM can cause valid frontmatter to be rejected if detection is too literal.
- Scaffolds can emit YAML that parses to the wrong type (`description` as a list instead of a string).
- Docs and validators can drift: documented multiline descriptions versus validators that insist on one-line strings.
- Pure shell parsing can silently collapse folded/literal scalar semantics even when it does not crash.

Sources:
- https://github.com/openai/codex/issues/13918
- https://github.com/openai/skills/pull/345
- https://jekyllrb.com/docs/front-matter/

## User Voices
- Shipwright: "`shipwright pipeline resume` crashes with `xargs: unterminated quote` when the pipeline state file's `goal` field contains single quotes..." and "`xargs` performs word splitting AND quote parsing." — https://github.com/ezigus/shipwright/issues/223
- OpenAI skills: "That means a freshly generated skill fails validation immediately instead of producing a valid starter template." — https://github.com/openai/skills/pull/345
- Codex: "When a local skill definition file named `SKILL.md` is saved as UTF-8 with BOM, Codex fails to load it even though the file contains valid YAML front matter..." — https://github.com/openai/codex/issues/13918
- Gemini users: "Users want a faster way to trigger specific skills without relying on the model to select them..." — https://github.com/google-gemini/gemini-cli/issues/21760
