---
name: fabric
description: >
  Routing-first Fabric operator skill for reusable named AI transforms over stdin,
  files, transcripts, notes, logs, and cleaned web text. Use when the user wants
  Fabric patterns, custom pattern packs, shell-pipe composition, or `fabric --serve`
  workflows — not generic one-off chat prompting, repo-aware coding, or fully
  deterministic automation.
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Works on macOS, Linux, and Windows where the Fabric CLI can be installed and
  configured. Best for CLI-centric users who already have provider keys or local
  model access and want repeatable prompt transforms rather than ad hoc chat.
license: CC-BY-4.0
metadata:
  version: "2.1.0"
  author: supercent-io
  keyword: fabric
  platforms: All platforms
  tags: fabric, patterns, ai-prompts, prompt-orchestration, content-transforms, cli, piping, summarize, extract, custom-patterns, multi-provider
  source: Daniel Miessler Fabric README + REST API docs + GitHub issue survey (2026-04-18)
---

# Fabric

Use this skill when the real job is **running a reusable named AI transform over existing text/content with Fabric**.

Fabric is strongest when three things are true:
1. the input already exists or can be cleaned first,
2. the transform is repeatable enough to deserve a named pattern,
3. the output should be delivered through a CLI, shell pipeline, or lightweight HTTP surface.

Read these support docs before going deeper:
- [references/routing-and-mode-selection.md](references/routing-and-mode-selection.md)
- [references/operator-packets-and-route-outs.md](references/operator-packets-and-route-outs.md)
- [references/install-and-provider-setup.md](references/install-and-provider-setup.md)
- [references/pattern-workflow-recipes.md](references/pattern-workflow-recipes.md)

## When to use this skill
- The user explicitly wants **Fabric**.
- The user wants a **named pattern** instead of improvising a fresh prompt every time.
- The job is a repeatable transform over **stdin, files, transcripts, clipboard text, notes, logs, or cleaned article text**.
- The user wants a **custom pattern pack** for recurring work.
- Fabric should sit inside a **shell pipeline** or a small local toolchain.
- Another tool needs **Fabric server mode** via `fabric --serve`.
- The boundary between **Fabric vs general LLM CLI vs coding assistant** is unclear.

## When not to use this skill
- **One-off chat prompting in the current session** → use the current model directly.
- **Repo-aware coding, editing, or git implementation** → use a coding-assistant skill.
- **Scraping, OCR, transcript recovery, or file conversion is still the hard part** → fix the upstream input layer first.
- **Deterministic multi-step automation is the real job** → use scripts or workflow automation, with Fabric only as one step if needed.
- **Provider/platform setup is the whole question and not Fabric-specific** → use the more relevant platform/provider skill first.

## Core boundary
- **Fabric** = reusable pattern-driven transforms on external text/content.
- **General LLM CLI** = ad hoc prompting without strong pattern-library expectations.
- **Coding assistant** = repo-aware editing, implementation, and git workflows.
- **Workflow automation / scripts** = deterministic orchestration where Fabric may be one stage.

## Instructions

### Step 1: Classify the request into one primary lane
Choose exactly one lane:

```yaml
fabric_intake:
  primary_lane: quick-transform | pattern-selection | custom-pattern | shell-pipeline | serve-api | boundary-review
  input_shape: stdin-text | file | clipboard | transcript | url-derived-text | logs | code-snippet | mixed | unknown
  output_shape: summary | extraction | rewrite | explanation | classification | structured-markdown | custom
  repetition_level: one-off | recurring | team-shared | embedded-in-script
  provider_need: default | specific-provider | local-model | server-mode | unknown
  input_ready: yes | no | unclear
```

Lane chooser:
- `quick-transform` → the text is already available and one strong Fabric pass is enough.
- `pattern-selection` → the user needs the right built-in pattern or family.
- `custom-pattern` → the workflow repeats and needs a stable output shape.
- `shell-pipeline` → Fabric is one step inside a larger terminal workflow.
- `serve-api` → another local tool or script should call Fabric over HTTP.
- `boundary-review` → the user is deciding among Fabric, a general LLM CLI, or a coding assistant.

### Step 2: Verify the input layer before talking about patterns
Answer these first:
1. Where does the text come from?
2. Is the text already clean enough for Fabric?
3. Is this a one-shot transform or a reusable workflow?
4. Is provider/model setup already available?

If the text is still messy HTML, OCR noise, bad transcripts, or missing entirely, say so explicitly. Do not pretend Fabric owns the upstream cleanup problem.

### Step 3: Run the correct lane

#### A. Quick-transform
Return:
- one recommended pattern,
- one exact command,
- expected output shape,
- one optional follow-up chain only if it materially helps.

Examples:
```bash
cat transcript.txt | fabric -p summarize
pbpaste | fabric -p extract_wisdom
git diff HEAD~1 | fabric -p explain_code
```

#### B. Pattern-selection
Return the top **1-3** plausible patterns and why.

Use job shape, not novelty:
- **summarize** → compress source into a readable brief
- **extract / wisdom / questions / claims** → pull structured ideas out
- **explain / analyze** → interpret code, prose, logs, incidents, or decisions
- **rewrite / improve / repurpose** → convert one artifact into another tone or shape

Do not dump the whole catalog.

#### C. Custom-pattern
Use when the workflow will recur.

Minimum scaffold:
```text
IDENTITY AND PURPOSE
STEPS
OUTPUT INSTRUCTIONS
INPUT
```

Good custom-pattern output includes:
- pattern name,
- exact use case,
- `system.md` skeleton,
- example invocation,
- note on when to fork vs reuse a stock pattern.

#### D. Shell-pipeline
Treat Fabric as one stage in a pipeline:

```text
fetch or prepare input → optional cleanup → fabric pattern → save / chain / post-edit
```

Return:
- what creates the input,
- where Fabric sits,
- where output goes,
- what still needs human review or another tool.

#### E. Serve-api
Use when another app/script needs HTTP access.

Baseline commands:
```bash
fabric --serve
curl http://localhost:8080/patterns/names
```

Also call out:
- whether `--api-key` is needed,
- local-only vs shared-machine assumptions,
- whether the caller needs pattern CRUD, listing, apply endpoints, or plain chat completion.

#### F. Boundary-review
Compare by workflow shape:
- **Fabric** → repeatable named transforms over external text/content
- **general LLM CLI** → flexible ad hoc prompting
- **coding assistant** → repo-aware code work
- **workflow automation** → deterministic multi-step logic

If the user is mixing use cases, keep Fabric only for the transform layer.

### Step 4: Return a short operator packet
Default output should contain:
- chosen lane,
- input source and cleanup assumptions,
- recommended pattern(s) or custom-pattern path,
- exact command(s) or artifact layout,
- realistic friction note,
- route-out if Fabric is not the whole answer.

Use this structure:

```text
# Fabric Workflow Packet

## Lane
- quick-transform | pattern-selection | custom-pattern | shell-pipeline | serve-api | boundary-review

## Input
- source: ...
- cleanup needed: ...
- assumptions: ...

## Recommended Fabric move
- pattern / custom pattern / server mode: ...
- why this fits: ...

## Command or artifact
- exact command(s) or `system.md` scaffold

## Output shape
- summary / extraction / rewrite / explanation / structured markdown / custom

## Friction
- provider setup / token limits / noisy input / post-editing / custom-pattern drift

## Route-outs
- next tool or workflow layer if Fabric is not the whole answer
```

### Step 5: Keep the advice reusable
Prefer:
- one primary lane,
- one top recommendation over a laundry list,
- a reusable custom-pattern scaffold over a clever one-off prompt,
- honest route-outs when Fabric is not the whole answer.

## Examples

### Example 1: Transcript summary
**Input**
> I already have transcript.txt. Show me how to use Fabric to summarize it and keep the workflow reusable.

**Output sketch**
- Lane: `quick-transform`
- Command: `cat transcript.txt | fabric -p summarize`
- Output: markdown summary
- Route-out: only add another extraction pass if action items matter

### Example 2: Weekly custom pattern
**Input**
> We summarize competitor articles every week. Help me make a reusable Fabric pattern pack.

**Output sketch**
- Lane: `custom-pattern`
- Deliver `system.md` scaffold plus invocation
- Explain why a custom pattern beats repeating a one-off prompt

### Example 3: Fabric or something else?
**Input**
> Should I use Fabric, a general LLM CLI, or a coding assistant for this workflow?

**Output sketch**
- Lane: `boundary-review`
- Keep repeatable text transforms in Fabric
- Route repo-aware editing to a coding assistant

## Best practices
1. Treat Fabric as a **pattern-first transform layer**, not a generic terminal chatbot.
2. Solve messy input acquisition before blaming the pattern.
3. Return the top 1-3 pattern choices instead of the full catalog.
4. Fork a custom pattern when the workflow repeats or the output shape must stay stable.
5. Only recommend `fabric --serve` when another tool genuinely needs HTTP access.
6. Keep provider/setup friction explicit instead of hiding it behind pattern talk.
7. If the task is really coding-assistant work or deterministic automation, route out early.

## References
- [Fabric upstream README](https://github.com/danielmiessler/Fabric/blob/main/README.md)
- [Fabric REST API docs](https://raw.githubusercontent.com/danielmiessler/Fabric/main/docs/rest-api.md)
- [references/routing-and-mode-selection.md](references/routing-and-mode-selection.md)
- [references/operator-packets-and-route-outs.md](references/operator-packets-and-route-outs.md)
- [references/install-and-provider-setup.md](references/install-and-provider-setup.md)
- [references/pattern-workflow-recipes.md](references/pattern-workflow-recipes.md)
