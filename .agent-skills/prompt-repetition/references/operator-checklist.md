# Prompt Repetition — Operator Checklist

## Quick decision

### Try repetition when all are true
- Model is **non-reasoning** or a lightweight / cheaper variant
- Failure looks like **late-context miss**, **options-first confusion**, or **index-sensitive lookup**
- Prompt still has enough context-window headroom for 2× or 3× input size
- You want a cheap A/B-style experiment before changing infrastructure

### Route elsewhere when any are true
- Task needs multi-step reasoning or synthesis
- Retrieved context is noisy, contradictory, or incomplete
- Prompt already contains too many tools/policies/steps
- Context budget is tight enough that duplication risks truncation
- A simpler structural fix exists (move the question, trim context, add an example)

## Safe intervention ladder
1. Repeat the **question only**
2. Repeat the **full prompt 2×**
3. Repeat the **full prompt 3×** only for index-sensitive cases with enough budget

## Reporting template
- **Fit:** good / weak
- **Task shape:** long-context retrieval / options-first MCQ / position-sensitive lookup / other
- **Smallest intervention:** question only / full prompt 2× / full prompt 3× / do not use repetition
- **Budget note:** input-token impact and context-window risk
- **Fallback:** restructure prompt / retrieval / reasoning model / other

## Example final line
> This is a good fit for prompt repetition because the lightweight model is losing a late question after a long context block. Try repeating the question first or the full prompt 2× if budget allows; if that still fails, fix context selection or switch to a stronger reasoning model.
