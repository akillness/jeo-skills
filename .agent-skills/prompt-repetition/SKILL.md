---
name: prompt-repetition
description: >
  Decide when repeating a full prompt is a useful accuracy hack for non-reasoning
  or lightweight LLM tasks, and when the real fix is better prompt structure,
  retrieval, or a stronger model. Use when the user has long-context retrieval,
  options-first multiple choice, or position-sensitive prompts on models like
  Haiku, Flash, or mini variants — even if they ask in domain language like the
  model missed the instruction at the end, forgot the question after a long
  context block, or keeps failing inventory/index lookups. Do not use as a
  universal prompt-engineering default for reasoning-heavy, tool-heavy, or RAG
  architecture problems.
allowed-tools: Read Write Bash Grep Glob
metadata:
  tags: prompt-engineering, llm-accuracy, long-context, lightweight-models, evaluation
  platforms: Claude, Gemini, ChatGPT, Codex
  version: "3.0.0"
  source: arXiv 2512.14982; Prompt Engineering Guide
---

# Prompt Repetition

## When to use this skill
- The user is using a **non-reasoning or lightweight model** and accuracy drops when the important question appears late in the prompt.
- The prompt shape is **long-context retrieval**, **options-first multiple choice**, or **position-sensitive lookup**.
- The user wants a **bounded decision rule** for whether to duplicate the prompt 2× or 3×, not a vague promise that prompt engineering will help.
- The workflow needs a cheap experiment before changing models or building retrieval infrastructure.
- The request mentions things like **the model forgot the question**, **missed the final instruction**, **lost the item at slot 25**, **got confused by a long options list**, or **performs worse on Haiku / Flash / mini models than on stronger reasoning models**.

Do **not** use this skill as the main workflow when:
- The real problem is **context selection, retrieval design, or noisy source stuffing** → use broader context-engineering or RAG work.
- The real problem is **reasoning depth** and a reasoning-capable model is available.
- The prompt is **tool-heavy / agentic / multi-step**, where duplicating the full prompt may just multiply cost and confusion.
- The user needs a universal always-on middleware policy. This skill is for **targeted use**, not blanket auto-apply.

## Core idea
Prompt repetition is a **task-shape-specific intervention**, not a universal prompting law.

The strongest evidence-backed cases are:
1. **Long-context retrieval** — the question comes after a lot of context and the model misses late details.
2. **Options-first MCQ** — choices appear before the question or the structure makes the actual ask easy to lose.
3. **Position-sensitive lookup** — inventories, ordered lists, or record positions where the model loses track of index-like detail.

The skill succeeds when it answers three questions clearly:
1. **Is this one of the task shapes where repetition is worth testing?**
2. **What repetition count is safe enough to try without blowing the context budget?**
3. **What should we do instead if repetition is the wrong tool?**

## Instructions

### Step 1: Classify the prompt shape before changing anything
Put the current prompt into one bucket:

| Shape | Typical signal | Repetition fit | Better alternative if fit is weak |
|---|---|---|---|
| Long-context retrieval | "The model ignores the question after a huge context block" | Good | Trim/select context, retrieval, restate question near end |
| Options-first MCQ | "The options come first and the model picks the wrong letter" | Good | Reorder question/options, simplify answer format |
| Position-sensitive lookup | "It misses item 25 in a long list" | Good | Chunk the list, provide structured table, use retrieval |
| Tool-heavy agent prompt | "There are many tools, policies, and steps" | Weak | Simplify policy, separate stages, use better orchestration |
| Reasoning-heavy task | "We need step-by-step synthesis or planning" | Weak | Use a reasoning model, decomposition, examples |
| RAG / search architecture | "The retrieved evidence is noisy or incomplete" | Weak | Fix retrieval, ranking, chunking, context packing |

If the task lands in a **weak** row, do not recommend prompt repetition as the main answer.

### Step 2: Check the model and cost guardrail
Prompt repetition multiplies **input tokens**, even if the paper reports no increase in generated output length or latency for the tested runs.

Minimum checks:
- **Model class** — is this a non-reasoning / lightweight model or a stronger reasoning-capable model?
- **Prompt length now** — estimate whether 2× or 3× would still fit comfortably inside the usable context budget.
- **Operational budget** — is extra input cost acceptable for this workflow?
- **Failure mode** — are we fixing a late-context miss, or is the task actually about reasoning or retrieval quality?

Conservative default:
- if the prompt is already near the context limit, **do not** recommend full repetition
- if the task needs structured reasoning, **do not** use repetition as a substitute for model choice
- if only the final question/instruction matters, try **restating the question** before duplicating the whole prompt

### Step 3: Choose the smallest useful intervention
Use the cheapest intervention that matches the failure:

1. **Repeat the question only**
   - Best when the context is huge but only the final ask is being lost.
   - Cheapest first experiment.

2. **Repeat the full prompt 2×**
   - Default experiment for long-context retrieval and options-first MCQ on lightweight models.
   - Good first pass when the whole prompt structure matters.

3. **Repeat the full prompt 3×**
   - Reserve for clearly position-sensitive or index-heavy tasks.
   - Only if the cost and context window are still safe.

If the user cannot afford the input-token overhead, route to prompt restructuring or retrieval instead.

### Step 4: Apply explicit opt-out rules
Do **not** recommend repetition when any of these are true:
- the user already has a good reasoning model and the failure is multi-step reasoning
- the prompt includes many tools, policies, or action constraints that would just be duplicated noisily
- the retrieval set is weak, contradictory, or irrelevant
- the context budget is already tight enough that duplication risks truncation or degraded performance
- the task can be fixed more cleanly by moving the question, reducing context, or adding a small example

### Step 5: Return a decision, not just a trick
A good answer should include:
1. **Fit** — why repetition is or is not appropriate here
2. **Smallest recommended intervention** — repeat question only, full prompt 2×, full prompt 3×, or do not use repetition
3. **Budget note** — input-token / context-window implication
4. **Fallback / route-out** — what to do instead if repetition is the wrong tool

Use this response shape:
> "This is a [good / weak] fit for prompt repetition because [task shape]. I would try [smallest intervention] first. Watch [token/context risk]. If that fails, switch to [better alternative]."

### Step 6: Keep evaluation narrow and comparable
When testing repetition:
- use the **same prompt** except for the repetition change
- compare baseline vs 2× vs 3× only when the budget allows
- judge success on **task accuracy**, not on style or length alone
- stop if the repeated prompt causes context pressure or obvious prompt bloat

If more than one change is needed, repetition is probably not the main lever.

### Step 7: Route out when another job starts
- **Context selection / retrieval / chunking / source quality** → broader context-engineering or RAG work
- **Reasoning-heavy synthesis / planning** → stronger reasoning model or decomposition workflow
- **Prompt examples / output-format steering** → few-shot or prompt-structure work
- **Tool-policy / action-constraint confusion** → simplify orchestration instead of duplicating the whole prompt

## Examples

### Example 1: Options-first MCQ on a lightweight model
**Prompt:**
> I have a long options-first multiple-choice prompt on a Flash model. Should I duplicate the prompt or restructure it?

**Good response shape:**
- classify as options-first MCQ
- recommend either question restatement or full prompt 2× as the first bounded experiment
- mention token-cost tradeoff
- note that reordering the prompt is a valid structural alternative

### Example 2: RAG quality complaint
**Prompt:**
> Our RAG answers are weak. Should we add prompt repetition everywhere?

**Good response shape:**
- say this is a weak fit
- explain that retrieval/context quality is the bigger lever
- route to context engineering or RAG fixes instead of blanket repetition

### Example 3: Position-sensitive inventory lookup
**Prompt:**
> A mini model keeps missing the item at slot 25 in a long inventory list.

**Good response shape:**
- classify as position-sensitive lookup
- allow 2× and possibly 3× repetition if budget permits
- mention structured-table or chunking fallback if cost is too high

### Example 4: Reasoning model question
**Prompt:**
> We have a reasoning-capable model available, but it is more expensive. Does prompt repetition replace it?

**Good response shape:**
- say no, repetition is not a substitute for reasoning ability
- limit repetition to targeted non-reasoning failure modes
- route multi-step reasoning to the stronger model or decomposition

## Best practices
1. Treat prompt repetition as a **targeted experiment**, not default middleware.
2. Start with the **smallest intervention** that matches the failure mode.
3. Always mention **input-token cost** and context-budget pressure.
4. Prefer **prompt restructuring or retrieval fixes** when the real issue is context quality.
5. Drop weakly evidenced claims instead of letting the skill become a generic prompt-hacks bucket.
6. Keep the final recommendation binary: **try repetition here** or **route elsewhere**.

## References
- [references/evidence-and-boundaries.md](references/evidence-and-boundaries.md)
- [references/operator-checklist.md](references/operator-checklist.md)
