# Solution Landscape: prompt-repetition modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Full prompt repetition | Duplicate the full prompt 2× or 3× before sending it to a non-reasoning model | Strongest direct match to the paper; simple to test; no model change required | Increases input-token cost; can overgeneralize if auto-applied too broadly | Best treated as a scoped transform for specific task shapes |
| Restate or repeat the question only | Repeat the question/instruction near the end of the prompt instead of duplicating everything | Cheaper than full duplication; often enough for long-context misses | Not the same as the paper's tested intervention; may miss options/context interactions | Good fallback when full repetition is too expensive |
| Prompt reordering / options-last formatting | Put the question and choices in a more favorable layout | Solves some MCQ and retrieval issues structurally | Requires prompt redesign, not just a wrapper | Better first move for many options-first prompts |
| Context engineering / selective context | Improve what context is included and how it is presented | Broader, more transferable than repetition alone | More design work; may require retrieval or decomposition | Framed by Prompting Guide as the broader optimization layer |
| RAG or pseudo-RAG prompt structuring | Retrieve or stage evidence rather than resend the whole prompt | More scalable for large corpora | Heavier infrastructure; slower to adopt for simple tasks | Supported by long-context prompt-engineering research |
| Few-shot examples / task-specific exemplars | Add examples showing the desired behavior | Helps format and reasoning consistency | Costs tokens; does not directly solve late-context access | Common alternative in prompt engineering guides |
| Reasoning-model escalation | Use a reasoning-capable model instead of non-reasoning repetition tricks | Often more robust for multi-step tasks | Higher cost/latency; may be unavailable | Important route-out because the paper scope is non-reasoning only |

## Categories
- **Direct repetition transforms**: full prompt repetition, repeat-question-only variants
- **Structural prompt fixes**: reorder question/options, restate instructions near the end, simplify layout
- **Context-management alternatives**: context engineering, selective context, retrieval, pseudo-RAG
- **Model-selection alternatives**: reasoning-model escalation, stronger-model switch

## What People Actually Use
People do not seem to treat prompt repetition as the only or default answer. In practice, they mix prompt restructuring, context reduction, retrieval, stronger models, and occasional copy-paste repetition. Indexed discussion around the paper is exploratory — users are trying the trick on Gemma and long-context tasks, but the surrounding ecosystem still talks more often about context engineering and retrieval than about universal repetition middleware.

## Frequency Ranking
1. Context engineering / selective context / retrieval-style fixes
2. Prompt restructuring or restating the question/instruction
3. Full prompt repetition on non-reasoning, long-context, or options-first tasks
4. Switching to stronger or reasoning models when the task is not repetition-friendly

## Key Gaps
- The repo lacks a practical **decision rule** for when repetition is worth trying versus when to restructure the prompt or use retrieval.
- The current skill bundles too many weakly supported claims (for example broad auto-apply and game-dialogue language) instead of centering the strongest evidence-backed cases.
- There is no compact operator checklist for **cost guardrails** (input-token multiplication, context-window budget, and opt-out conditions).
- There are no evals showing the intended trigger behavior or routing away from reasoning-heavy / broader-context-engineering cases.

## Contradictions
- The paper reports gains without extra output tokens or latency, but repetition still increases **input-token cost**, so operational tradeoffs remain real even when generation behavior is unchanged.
- The broader market talks heavily about context engineering and retrieval, while the current skill reads as if repetition itself should be auto-applied broadly.
- Community discussion treats repetition as an interesting targeted hack; the current skill presents it more like a general-purpose always-on optimization layer.

## Key Insight
The right modernization is not "make prompt repetition bigger." It is to turn `prompt-repetition` into a narrow decision-first skill: use it for non-reasoning prompts that are retrieval-heavy, options-first, or position-sensitive; add explicit token-budget and opt-out rules; and route broader prompt-design, retrieval, or reasoning-model choices to more appropriate techniques instead of pretending one duplication trick replaces context engineering.
