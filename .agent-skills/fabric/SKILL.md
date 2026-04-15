---
name: fabric
description: >
  Pattern-first CLI orchestration with Daniel Miessler's Fabric for turning stdin,
  files, URLs, transcripts, notes, logs, and scraped text into repeatable AI
  transforms such as summaries, extraction, rewriting, classification, and custom
  prompt workflows. Use when the user wants reusable named patterns, shell-pipe
  composition, custom pattern packs, or Fabric's REST/server mode — not generic
  one-off chat prompting or repo-editing agents. Triggers on: fabric, pattern
  library, summarize transcript, extract wisdom, custom pattern, pipe text through
  AI, stdin prompt workflow, pattern pack, fabric --serve.
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Works on macOS, Linux, and Windows where the Fabric CLI can be installed and
  configured. Best for CLI-centric users who already have provider keys or local
  model access and want repeatable prompt transforms rather than ad hoc chat.
license: CC-BY-4.0
metadata:
  version: "2.0.0"
  author: supercent-io
  keyword: fabric
  platforms: All platforms
  tags: fabric, patterns, ai-prompts, prompt-orchestration, content-transforms, cli, piping, summarize, extract, custom-patterns, multi-provider
  source: Daniel Miessler Fabric README + REST API docs + GitHub issue survey (2026-04-15)
---

# Fabric

Use this skill when the real job is **running a reusable named AI transform over text/content in a CLI workflow**.

Fabric is not just "another AI terminal client". Its strength is the combination of:
1. a large **pattern library** organized around real jobs,
2. **stdin / file / transcript / URL-adjacent workflows**, and
3. the ability to turn repeated prompt behavior into a **maintained custom pattern pack**.

Read these support docs before choosing the workflow:
- [references/routing-and-mode-selection.md](references/routing-and-mode-selection.md)
- [references/install-and-provider-setup.md](references/install-and-provider-setup.md)
- [references/pattern-workflow-recipes.md](references/pattern-workflow-recipes.md)

## When to use this skill
- The user explicitly wants **Fabric** or a **pattern-first prompt CLI**.
- The job is to run a reusable transform over stdin, files, transcripts, clipboard text, notes, logs, or article text.
- The user wants a **named pattern** such as summarize, extract, explain, analyze, or rewrite instead of improvising a new prompt each time.
- The user wants to create or curate **custom patterns** for a repeated workflow.
- The user wants to run Fabric as a lightweight **REST API/server** for an existing pipeline.
- The user needs help deciding **which pattern / mode / provider / shell composition** to use for a repeatable content-transform workflow.

## When not to use this skill
- **The user only needs a one-off prompt answered in the current agent session** → use the current model directly; Fabric would add unnecessary setup.
- **The main job is repo-aware coding, code editing, or git-driven implementation** → use a coding-assistant skill instead of forcing Fabric into repo editing.
- **The main job is upstream content acquisition or scraping reliability** → solve the fetch/transcript/extraction layer first, then use Fabric on the clean text.
- **The main job is fully deterministic batch automation or application logic** → prefer a script or workflow automation layer with Fabric as one step, not the whole substrate.
- **The main job is general model/provider setup without a Fabric-specific workflow** → use the more relevant provider/platform skill first.

## Core idea
Think of Fabric as a **pattern router for text transforms**:

```text
collect text → choose pattern → run transform → post-edit or chain next step
```

Typical wins:
- transcript → summary
- article → extracted insights
- log output → issue analysis
- rough notes → cleaner outline
- source material → custom repeatable workflow

Typical non-wins:
- vague chatting with no repeated workflow
- repo editing / autonomous coding
- treating Fabric as the best tool for raw scraping, OCR, or deterministic ETL

## Instructions

### Step 1: Classify the job before reaching for a pattern
Normalize the request first.

```yaml
fabric_intake:
  primary_mode: quick-transform | pattern-selection | custom-pattern | shell-pipeline | serve-api | migration-review
  input_shape: stdin-text | file | clipboard | transcript | url-derived-text | logs | code-snippet | mixed | unknown
  output_shape: summary | extraction | rewrite | explanation | classification | structured-markdown | custom
  repetition_level: one-off | recurring | team-shared | embedded-in-script
  provider_need: default | specific-provider | local-model | server-mode | unknown
  reliability_need: low | medium | high
```

Choose exactly one primary mode for the run:
- `quick-transform` → run or design one Fabric transform over already-available text
- `pattern-selection` → decide which existing pattern or family to use
- `custom-pattern` → create or tune a reusable pattern for repeated work
- `shell-pipeline` → place Fabric cleanly inside a larger terminal workflow
- `serve-api` → expose Fabric over HTTP for another tool or local service
- `migration-review` → decide whether Fabric is the right tool at all versus a general LLM CLI, script, or coding assistant

### Step 2: Make sure the input layer is honest
Before discussing patterns, answer these:
1. **Where does the text actually come from?** clipboard, file, logs, transcript, article text, command output?
2. **Is the text already clean enough to send to Fabric?**
3. **Does the user need one transform or a repeatable workflow?**
4. **Is provider/model setup already available?**

If the text is not yet available or still messy HTML/PDF/transcript noise, do not pretend Fabric alone solves that. Describe the upstream clean-text step first.

### Step 3: Choose the right mode

#### A. Quick-transform
Use when the user already has text and needs one strong transform.

Good deliverables:
- exact Fabric command
- recommended pattern
- minimal pre-clean step if needed
- expected output shape
- one follow-up chain if useful

Examples:
- `cat transcript.txt | fabric -p summarize`
- `pbpaste | fabric -p extract_wisdom`
- `git diff HEAD~1 | fabric -p explain_code`

#### B. Pattern-selection
Use when the user knows the material but not the best pattern.

Choose by job, not by novelty:
- **summarize** → compress source into a readable brief
- **extract / wisdom / questions / claims** → pull structured ideas out of the source
- **explain / analyze** → clarify code, prose, logs, incidents, or decisions
- **rewrite / improve / repurpose** → convert one artifact into another tone or shape
- **specialized patterns** → use only when the input and output are clearly domain-matched

Do not dump the entire pattern catalog. Return the top 1-3 plausible patterns and why.

#### C. Custom-pattern
Use when the request will recur.

Prefer a custom pattern when:
- the user repeats the same workflow often,
- stock patterns are close but not precise enough,
- tone/output rules matter,
- the workflow will be shared across a team.

Minimum custom-pattern scaffold:
```text
IDENTITY AND PURPOSE
STEPS
OUTPUT INSTRUCTIONS
INPUT
```

Good custom-pattern work includes:
- pattern name
- exact use case
- system.md skeleton
- example invocation
- notes about when to fork versus reuse a stock pattern

#### D. Shell-pipeline
Use when Fabric is only one step inside a larger terminal workflow.

Common pattern:
```text
fetch or prepare input → optional cleanup → fabric pattern → save / chain / post-edit
```

Good operator guidance includes:
- what produces the input,
- where Fabric sits,
- what command or file receives the output,
- what still requires a human or another tool.

#### E. Serve-api
Use when another local tool or script should call Fabric over HTTP.

Core commands:
```bash
fabric --serve
curl http://localhost:8080/patterns/names
```

Key decisions:
- whether to add `--api-key`
- local-only vs shared-machine use
- whether the caller needs pattern CRUD, pattern listing, or plain chat completion
- whether custom patterns must resolve from the correct directory

#### F. Migration-review
Use when the user is really deciding among Fabric, a general LLM CLI, or a coding assistant.

Default boundary:
- **Fabric** → reusable pattern-driven transforms on external text/content
- **general LLM CLI** → flexible ad hoc prompting without a strong pattern library
- **coding assistant** → repo-aware editing and implementation work
- **script/workflow automation** → deterministic batch logic around multiple steps

### Step 4: Return an operator packet, not a product brochure
Default output should include:
- chosen Fabric mode
- input source and cleanup assumptions
- recommended pattern(s) or custom-pattern path
- exact command(s) or file layout
- provider/model note if relevant
- route-out if Fabric is the wrong tool

Use this structure:

```text
# Fabric Workflow Packet

## Mode
- quick-transform | pattern-selection | custom-pattern | shell-pipeline | serve-api | migration-review

## Input
- source: ...
- cleanup needed: ...
- assumptions: ...

## Recommended Fabric move
- pattern / custom pattern / server mode: ...
- why this is the right fit: ...

## Command or artifact
- exact command(s) here

## Output shape
- summary / extraction / rewrite / explanation / structured markdown / custom

## Risks or friction
- provider setup / token limits / messy input / post-editing / custom pattern drift

## Route-outs
- if Fabric is not the whole answer, name the next tool or workflow layer
```

### Step 5: Be explicit about the practical friction
Call these out when relevant:
- provider or vendor configuration tax
- pattern discoverability in a large catalog
- long-input limits or messy source material
- the difference between a helpful first pass and a finished artifact
- when a shell wrapper or script is the right next step

### Step 6: Keep the skill centered on repeatability
Good Fabric advice should increase **reuse**.

Prefer:
- a named pattern over a vague instruction
- one top recommendation over a laundry list
- a reusable custom-pattern scaffold over a one-off clever prompt
- shell composition guidance over marketing copy about "AI-powered everything"

## Output format
Always return a **short operator-style Fabric workflow packet**.

Required qualities:
- one primary mode
- a clean boundary between Fabric and adjacent tools
- exact invocation or custom-pattern scaffold
- explicit assumptions about input quality
- realistic notes about setup, provider choice, or post-editing

## Examples

### Example 1: Transcript to summary
**Input**
> I already have a podcast transcript. I want to pipe it through Fabric and get a concise summary plus action items.

**Output sketch**
- Mode: `quick-transform`
- Pattern recommendation: `summarize` or an extraction-oriented pattern
- Command: `cat transcript.txt | fabric -p summarize`
- Output shape: markdown summary + explicit note if a second pass is needed for action items

### Example 2: Custom research digest pattern
**Input**
> We keep summarizing competitor articles the same way every week. I want a reusable Fabric pattern for this.

**Output sketch**
- Mode: `custom-pattern`
- Deliver `system.md` skeleton with sections for thesis, notable claims, GTM implications, and open questions
- Include example directory layout under the user's pattern directory

### Example 3: Fabric or something else?
**Input**
> Should I use Fabric, a generic LLM CLI, or a coding assistant for this workflow?

**Output sketch**
- Mode: `migration-review`
- Compare by workflow shape
- Route repo-editing to coding assistant, ad hoc chat to generic CLI, reusable transforms to Fabric

## Best practices
1. Treat Fabric as a **pattern-first transform layer**, not a generic terminal chatbot.
2. Solve messy input acquisition before blaming the pattern.
3. Return the top 1-3 pattern choices instead of dumping the full catalog.
4. Reach for a custom pattern when the workflow repeats or needs a stable output shape.
5. Use shell composition honestly; Fabric often works best as one step in a larger pipeline.
6. For server mode, specify auth/address assumptions instead of just saying `fabric --serve`.
7. If the task is really coding-assistant work or deterministic automation, route out early.

## References
- [Fabric upstream README](https://github.com/danielmiessler/Fabric/blob/main/README.md)
- [Fabric REST API docs](https://raw.githubusercontent.com/danielmiessler/Fabric/main/docs/rest-api.md)
- [references/routing-and-mode-selection.md](references/routing-and-mode-selection.md)
- [references/install-and-provider-setup.md](references/install-and-provider-setup.md)
- [references/pattern-workflow-recipes.md](references/pattern-workflow-recipes.md)
