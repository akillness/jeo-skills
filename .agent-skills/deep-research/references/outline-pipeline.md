# Outline Pipeline (Phase 1)

Generate and extend the research outline. Three commands share this pipeline:
`/research` (create), `/research-add-items` (add objects), `/research-add-fields`
(add dimensions). The outputs are two files in `{topic_slug}/`: `outline.yaml`
(items + execution config) and `fields.yaml` (field definitions).

> **Hard constraint:** every prompt template below must be reproduced verbatim —
> substitute only the `{xxx}` variables; do not modify structure or wording. All
> web search is delegated to the **web-search agent** (see
> `web-search-pipeline.md`).

---

## `/research` — Preliminary Research

**Trigger:** `/research <topic>`

### Step 1: Generate Initial Framework from Model Knowledge

Based on topic, use the model's existing knowledge to generate:
- Main research objects/items list in this domain
- Suggested research field framework

Output `{step1_output}`, then use AskUserQuestion to confirm:
- Need to add/remove items?
- Does the field framework meet requirements?

### Step 2: Web Search Supplement

Use AskUserQuestion to ask for the time range (e.g., last 6 months, since 2024,
unlimited).

**Parameter Retrieval:**
- `{topic}`: User input research topic
- `{YYYY-MM-DD}`: Current date
- `{step1_output}`: Complete output from Step 1
- `{time_range}`: User specified time range

Launch 1 web-search-agent (background). **Prompt Template:**

```python
prompt = f"""## Task
Research topic: {topic}
Current date: {YYYY-MM-DD}

Based on the following initial framework, supplement latest items and recommended research fields.

## Existing Framework
{step1_output}

## Goals
1. Verify if existing items are missing important objects
2. Supplement items based on missing objects
3. Continue searching for {topic} related items within {time_range} and supplement
4. Supplement new fields

## Output Requirements
Return structured results directly (do not write files):

### Supplementary Items
- item_name: Brief explanation (why it should be added)
...

### Recommended Supplementary Fields
- field_name: Field description (why this dimension is needed)
...

### Sources
- [Source1](url1)
- [Source2](url2)
"""
```



**One-shot Example** (assuming researching AI Coding History):

```
## Task
Research topic: AI Coding History
Current date: 2025-12-30

Based on the following initial framework, supplement latest items and recommended research fields.

## Existing Framework
### Items List
1. GitHub Copilot: Developed by Microsoft/GitHub, first mainstream AI coding assistant
2. Cursor: AI-first IDE, based on VSCode
...

### Field Framework
- Basic Info: name, release_date, company
- Technical Features: underlying_model, context_window
...

## Goals
1. Verify if existing items are missing important objects
2. Supplement items based on missing objects
3. Continue searching for AI Coding History related items within since 2024 and supplement
4. Supplement new fields

## Output Requirements
Return structured results directly (do not write files):

### Supplementary Items
- item_name: Brief explanation (why it should be added)
...

### Recommended Supplementary Fields
- field_name: Field description (why this dimension is needed)
...

### Sources
- [Source1](url1)
- [Source2](url2)
```


### Step 3: Ask User for Existing Fields

Use AskUserQuestion to ask if the user has an existing field definition file; if
so, read and merge it.

### Step 4: Generate Outline (Separate Files)

Merge `{step1_output}`, `{step2_output}`, and the user's existing fields, then
generate two files:

**outline.yaml** (items + config):
- `topic`: Research topic
- `items`: Research objects list
- `execution`:
  - `batch_size`: Number of parallel agents (confirm with AskUserQuestion)
  - `items_per_agent`: Items per agent (confirm with AskUserQuestion)
  - `output_dir`: Results output directory (default: `./results`)

**fields.yaml** (field definitions):
- Field categories and definitions
- Each field's `name`, `description`, `detail_level`
- `detail_level` hierarchy: `brief` → `moderate` → `detailed`
- `uncertain`: Uncertain fields list (reserved field, auto-filled in deep phase)

### Step 5: Output and Confirm

- Create directory: `./{topic_slug}/`
- Save: `outline.yaml` and `fields.yaml`
- Show to user for confirmation

### Output Path

```
{current_working_directory}/{topic_slug}/
  ├── outline.yaml    # items list + execution config
  └── fields.yaml     # field definitions
```


### Follow-up Commands

- `/research-add-items` — Supplement items
- `/research-add-fields` — Supplement fields
- `/research-deep` — Start deep research (→ `deep-pipeline.md`)

---

## `/research-add-items` — Supplement Research Objects

**Trigger:** `/research-add-items`

### Step 1: Auto-locate Outline

Find the `*/outline.yaml` file in the current working directory, auto-read it.

### Step 2: Get Supplement Sources in Parallel

Simultaneously:
- **A. Ask user**: What items to supplement? Any specific names?
- **B. Ask if Web Search needed**: Launch agent to search for more items?

### Step 3: Merge and Update

- Append new items to `outline.yaml`
- Display to user for confirmation
- Avoid duplicates
- Save the updated outline

### Output

Updated `{topic}/outline.yaml` file (in-place modification).

---

## `/research-add-fields` — Supplement Research Fields

**Trigger:** `/research-add-fields`

### Step 1: Auto-locate Fields File

Find the `*/fields.yaml` file in the current working directory, auto-read the
existing field definitions.

### Step 2: Get Supplement Source

Ask the user to choose:
- **A. User direct input**: User provides field names and descriptions
- **B. Web Search**: Launch agent to search common fields in this domain

### Step 3: Display and Confirm

- Display the suggested new fields list
- User confirms which fields to add
- User specifies field `category` and `detail_level`

### Step 4: Save Update

Append confirmed fields to `fields.yaml`, save the file.

### Output

Updated `{topic}/fields.yaml` file (in-place modification, requires user
confirmation).
