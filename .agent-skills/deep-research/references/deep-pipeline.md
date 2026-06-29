# Deep Pipeline (Phase 2)

Read the research outline and launch one independent web-search agent per item
for deep investigation, writing each result as a validated JSON file. Background,
parallel, resumable.

**Trigger:** `/research-deep`

> **Hard constraint:** the prompt template below must be reproduced verbatim —
> substitute only the `{xxx}` variables; do not modify structure or wording. All
> search delegates to the **web-search agent** (see `web-search-pipeline.md`).

## Workflow

### Step 1: Auto-locate Outline

Find the `*/outline.yaml` file in the current working directory, read the items
list and execution config (including `items_per_agent`).

### Step 2: Resume Check

- Check completed JSON files in `output_dir`
- Skip completed items

### Step 3: Batch Execution

- Batch by `batch_size` (need user approval before next batch)
- Each agent handles `items_per_agent` items
- Launch web-search-agent (background, parallel, disable task output)

**Parameter Retrieval:**
- `{topic}`: `topic` field from `outline.yaml`
- `{item_name}`: item's `name` field
- `{item_related_info}`: item's complete YAML content (name + category + description, etc.)
- `{output_dir}`: `execution.output_dir` from `outline.yaml` (default: `./results`)
- `{fields_path}`: absolute path to `{topic}/fields.yaml`
- `{output_path}`: absolute path to `{output_dir}/{item_name_slug}.json` (slugify `item_name`: replace spaces with `_`, remove special chars)
- `{validate_script}`: absolute path to the shipped validator, **resolved
  dynamically from the filesystem** (the skill ships under different roots — do
  not hardcode). Probe the real install roots and take the first that exists:
  ```bash
  validate_script="$(ls \
    "$HOME/.agents/skills/deep-research/scripts/validate_json.py" \
    "$PWD/.agent-skills/deep-research/scripts/validate_json.py" \
    "$HOME/.claude/skills/deep-research/scripts/validate_json.py" \
    "$HOME/.claude/skills/research/validate_json.py" \
    2>/dev/null | head -n1)"
  [ -n "$validate_script" ] || { echo "validate_json.py not found"; exit 1; }
  ```


**Prompt Template:**

```python
prompt = f"""## Task
Research {item_related_info}, output structured JSON to {output_path}

## Field Definitions
Read {fields_path} to get all field definitions

## Output Requirements
1. Output JSON according to fields defined in fields.yaml
2. Mark uncertain field values with [uncertain]
3. Add uncertain array at the end of JSON, listing all uncertain field names
4. All field values must be in English

## Output Path
{output_path}

## Validation
After completing JSON output, run validation script to ensure complete field coverage:
python {validate_script} -f {fields_path} -j {output_path}
Task is complete only after validation passes.
"""
```

> `{validate_script}` keeps the prompt verbatim-substitutable while resolving to
> the validator that **actually exists on this machine** — never a hardcoded
> path. The upstream original hardcodes `~/.claude/skills/research/validate_json.py`,
> which is absent in a jeo-skills install; the Step 3 `ls … | head -n1` probe
> instead selects the first real install root (`~/.agents/skills/…`, the repo
> checkout, or a `~/.claude/skills/…` copy), so the same template works wherever
> the skill is installed.


**One-shot Example** (assuming researching GitHub Copilot):

```
## Task
Research name: GitHub Copilot
category: International Product
description: Developed by Microsoft/GitHub, first mainstream AI coding assistant, ~40% market share, output structured JSON to {project_dir}/results/GitHub_Copilot.json

## Field Definitions
Read {project_dir}/fields.yaml to get all field definitions

## Output Requirements
1. Output JSON according to fields defined in fields.yaml
2. Mark uncertain field values with [uncertain]
3. Add uncertain array at the end of JSON, listing all uncertain field names
4. All field values must be in English

## Output Path
{project_dir}/results/GitHub_Copilot.json

## Validation
After completing JSON output, run validation script to ensure complete field coverage:
python "$validate_script" -f {project_dir}/fields.yaml -j {project_dir}/results/GitHub_Copilot.json

Task is complete only after validation passes.
```

### Step 4: Wait and Monitor

- Wait for the current batch to complete
- Launch the next batch
- Display progress

### Step 5: Summary Report

After all items complete, output:
- Completion count
- Failed / uncertain-marked items
- Output directory

## Agent Config

- Background execution: Yes
- Task Output: Disabled (the agent has an explicit output file when complete)
- Resume support: Yes

## Validation Gate

`validate_json.py` (PyYAML required) checks each item's JSON against
`fields.yaml`:

bash
# {validate_script} is resolved dynamically (see Step 3) — never hardcoded
python "$validate_script" \
  -f {topic}/fields.yaml \
  -j {output_dir}/{item_slug}.json


- Reads `field_categories[].fields[]` from `fields.yaml`; a field is required
  when `required: true`.
- Walks both flat (`{"name": ...}`) and nested (`{"basic_info": {"name": ...}}`)
  JSON shapes, skipping the internal keys `_source_file` and `uncertain`.
- Reports coverage %, missing required/optional fields by category, and extra
  fields. **PASS** only when there are no missing required fields; the process
  exits non-zero otherwise, so an item is "done" only after a clean pass.
- A requested `-j` file that does not exist (item never written) also exits
  non-zero — a missing output can never be silently counted as a pass.

## Next step

When all items pass validation, run `/research-report` (→ `report-pipeline.md`).
