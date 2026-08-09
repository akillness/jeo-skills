# The runtime skills engine

goalflow skills are reusable, Markdown-authored capabilities that get
**matched to a user query** and **injected into the system prompt** on demand
— progressive disclosure, so the LLM sees a skill's full instructions only
when the query calls for it.

> These are goalflow *runtime* skills, a different thing from the `SKILL.md`
> files in this jeo-skills catalog. For authoring catalog skills, use
> `skill-standardization` or `write-a-skill`.

## Two engines, one decision

| Engine | Location | Skills can |
|---|---|---|
| Main project | `src/goalflow/skill/` | be injected into a workflow LLM node's prompt |
| Agent kit | `src/agent_kit/skills/` | also be **executed** as tools (prompt-only, executable `module:func`, or hybrid) |

Pick by one question: **must the capability be called, or only described?**
Described → main-project engine. Called → `agent_kit` (see
`references/agent-kit.md`).

## Anatomy

```
skills/
  weather_query/
    SKILL.md
    scripts/
      weather_api.py     # optional; passive in the main-project engine
  product_search/
    SKILL.md
```

`SKILL.md` is YAML frontmatter plus a Markdown body:

```markdown
---
name: 天气查询
description: 查询指定城市的实时天气信息，包括温度、湿度、风力等
version: 1.0.0
author: your-name
tags: [weather, query]
triggers: [天气, 气温, weather]
enabled: true
---

## 概述
...
## 使用指南
...
## 示例对话
...
## 限制
...
```

Frontmatter fields, parsed into `SkillMetadata` (`src/goalflow/skill/models.py`):

| Field | Required | Default | Notes |
|---|---|---|---|
| `name` | yes | — | display name |
| `description` | yes | — | **what the matcher reasons over** |
| `version` | no | `"1.0.0"` | |
| `author` | no | — | |
| `tags` | no | `[]` | |
| `triggers` | no | `[]` | metadata for humans / future keyword fallback |
| `enabled` | no | `true` | disabled skills are skipped |

Two easy mistakes:

- **`skill_id` is not in the file.** It is derived from the directory name.
  Renaming the directory changes the id.
- **`scripts/` is passive here.** The main-project engine records
  `SkillMetadata.scripts_dir` but does not execute anything. Only the
  `agent_kit` engine executes.

## The pipeline

Orchestrated by `SkillOrchestrator` (`src/goalflow/skill/orchestrator.py`);
build with `SkillOrchestrator.create_default()`.

```
query ─► [match] ─► [load bodies] ─► [inject into prompt] ─► augmented system prompt
```

1. **Load / register** — `SkillRegistry` (`registry.py`) scans the `skills/`
   directory (default `project_root/skills`), parses each `SKILL.md`,
   validates required fields, caches `SkillMetadata` by `skill_id`. Hot reload
   via mtime tracking (`scan()`, `reload()`, `has_changes()`).
2. **Match** — `SkillMatcher` (`matcher.py`) is **LLM-based, not keyword
   matching**. It sends a match prompt plus the query and a JSON list of
   `{skill_id, name, description}` to an LLM (default `qwen` / `qwen-turbo`,
   temp 0.1), parses `MatchResult` objects `{skill_id, skill_name,
   confidence, reason}`, filters by `threshold` (default `0.3`), sorts by
   confidence, truncates to `top_k` (default `1`).
3. **Load bodies** — `SkillLoader` (`loader.py`) returns the Markdown body
   (everything after the frontmatter) as `SkillContent`.
4. **Inject** — `SystemPromptBuilder` (`prompt_builder.py`) appends a
   `## 当前激活的技能详情` section, each matched skill under
   `### {name} (v{version})`.

One-call convenience:

```python
orchestrator = SkillOrchestrator.create_default()
augmented_prompt = orchestrator.build_prompt(
    query=user_query,
    base_prompt=system_prompt,
    top_k=1,
    threshold=0.3,
)
```

## Tuning the matcher

| Env var | Effect |
|---|---|
| `SKILL_MATCH_PROVIDER` | LLM provider for matching (default `qwen`) |
| `SKILL_MATCH_MODEL` | model (default `qwen-turbo`) |

`threshold` and `top_k` are arguments to `match()` / `build_prompt()`. Raise
`top_k` to activate several skills at once; raise `threshold` to be more
selective.

Matching costs an LLM call per query. `qwen-turbo` at temp 0.1 is the default
precisely because this is a hot path — do not casually point it at an
expensive model.

## Authoring rules that actually matter

1. **`description` carries the whole matching decision.** Be specific about
   *when* the skill applies, not what it is. A vague description means the
   skill never activates, or activates on everything.
2. **Body length is prompt cost on every matched turn.** Bodies are injected
   verbatim. Keep usage rules, examples, and limits; drop prose the model does
   not need.
3. **Use `enabled: false`** to keep a skill in the repo without activating it,
   instead of deleting or commenting it out.
4. **`triggers` / `tags` do not drive matching today.** They are metadata for
   humans and a future keyword fallback. Do not rely on them for activation.

## Checking a skill

```bash
python3 .agent-skills/goalflow/scripts/check_goalflow_skill.py skills/weather_query
python3 .agent-skills/goalflow/scripts/check_goalflow_skill.py --all skills/
```

Stdlib-only. It validates required frontmatter, flags a description too vague
or too short for the matcher, warns on body sizes that will be expensive to
inject, notes `enabled: false`, and reports whether a `scripts/` directory
will be passive (main-project engine) or executable (`agent_kit`). It emits
one ` ```review ` fenced JSON block and exits `1` on a blocker.
