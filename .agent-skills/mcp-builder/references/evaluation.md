# Evaluation

Operative guidance bundled from `anthropics/skills` commit
`3b3fad96af16a10759d930941b4520ba0c40edae` (2026-08-21), Apache-2.0.

Evaluations answer the only question that matters: **can an LLM accomplish
realistic tasks with this server?** A server that lists tools cleanly and fails
every real workflow has not been evaluated.

## The four-step process

1. **Tool inspection** — list the tools and understand what each can do.
2. **Content exploration** — use READ-ONLY operations to see what data exists.
3. **Question generation** — write 10 complex, realistic questions.
4. **Answer verification** — solve each question yourself and confirm the
   answer before recording it.

Step 4 is not optional. An expected value nobody verified tests nothing, and a
wrong expected value makes a working server look broken.

## Question requirements

Each of the 10 questions must be:

| Property | Meaning |
|---|---|
| Independent | does not depend on another question's result |
| Read-only | requires no destructive operation |
| Complex | needs multiple tool calls and real exploration |
| Realistic | reflects something a human would actually ask |
| Verifiable | one clear answer, checkable by string comparison |
| Stable | the answer will not drift over time |

Stability is the subtle one: "how many open issues are there" is unstable,
while "which release introduced flag X" is stable.

## Output format

```xml
<evaluation>
  <qa_pair>
    <question>Find discussions about AI model launches with animal codenames. One model needed a specific safety designation using the format ASL-X. What number X was being determined for the model named after a spotted wild cat?</question>
    <answer>3</answer>
  </qa_pair>
  <!-- nine more qa_pairs -->
</evaluation>
```

That example is instructive: it requires several searches, cross-referencing,
and extraction, but resolves to a single short verifiable token.

## Running the harness

Upstream ships `scripts/evaluation.py` with `scripts/connections.py` and a
`requirements.txt`. The harness connects a model to your server, runs each
question, and reports pass or fail. It expects structured output from the model
in `<summary>`, `<feedback>`, and `<response>` tags — the feedback channel is
useful signal about which tools were confusing.

### Before running

This is the one step in the skill that spends money and touches live systems.
Confirm all of the following first:

- [ ] An Anthropic API key is available and its owner approves the spend
- [ ] Cost per run is understood — every question is a model conversation with
      multiple tool calls
- [ ] Every question is genuinely read-only
- [ ] The server points at non-production data
- [ ] Rate limits on the wrapped API can absorb the run

Do not run the harness "just to see". Do not run it against production.

## Reading results

- **Systematic failures** across questions usually mean tool design, not model
  capability: ambiguous names, missing pagination, unhelpful errors.
- **One-off failures** are often an unverified expected answer — recheck step 4
  before changing the server.
- **Model feedback** in `<feedback>` tags frequently names the exact tool whose
  description misled it. Fix the description before adding a tool.

## Reporting honestly

Report the pass count out of ten and what failed. "Evaluations were created" is
not a result. If the harness was not run — because of cost, missing key, or no
approval — say that plainly rather than implying the server was validated.
