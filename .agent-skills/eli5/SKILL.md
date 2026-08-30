---
name: eli5
description: >
  Explain a topic, codebase, document, concept, or error at a specific
  audience's knowledge level and decision context. Use for ELI5, explain like
  I'm five, explain this to my manager, parent, child, partner, or team, break
  it down, dumb it down, make it understandable, or simplify it for a named
  age, grade, education level, job role, or relationship. This skill owns pure
  audience-adaptive explanation. Route requests that first require auditing or
  verifying a claim, change, fix, or test result to
  `audit-verify-explain-grade-5`; route tutorials, runbooks, and help-center
  content to `technical-writing`.
allowed-tools: Bash Read Glob Grep
compatibility: >
  Prompt-only for ordinary use. Explaining local code or documents requires
  read access to those sources. The optional upstream A/B evaluation harness
  needs Python, Claude CLI access, and metered model calls.
license: MIT
metadata:
  tags: eli5, explain, plain-language, audience, teaching, communication, analogy, simplify
  platforms: Claude, ChatGPT, Gemini, Codex, Cursor, Cline
  version: "1.0"
  source: https://github.com/DreambigOu/ELI5
---

# Explain Like I Am

Turn a complex subject into an explanation calibrated to one real audience.
Preserve the truth, useful caveats, and the audience's dignity. The goal is not
merely shorter text. It is the right mental model, vocabulary, depth, framing,
and next decision for that reader.

This adaptation is based on DreambigOu/ELI5 at commit
`a766623b062331fdde53467001379b4ddf3acc2f`. See the pinned source and MIT notice
in [source and evaluation](references/source-and-evaluation.md).

## When to use this skill

- The user says `ELI5`, "explain like I'm five," "break this down," "dumb it
  down," or "make this understandable."
- The explanation targets a named age, grade, education level, profession,
  decision-maker, family member, colleague, or other audience.
- Code, an error, a document, or a technical concept needs a purpose-first
  explanation for someone who will not benefit from the source's original
  jargon.
- The same facts need a different frame for an engineer, manager, designer,
  executive, student, parent, partner, child, or friend.

Do not use this skill for these neighboring jobs:

- Audit, review, check, or verify a change or claim and then explain the
  evidence simply: use `audit-verify-explain-grade-5`.
- Write a tutorial, FAQ, onboarding guide, runbook, or help-center article: use
  `technical-writing`.
- Draft or revise a scholarly paper: use `research-paper-writing`.
- Create slides or a presentation artifact: use `presentation-builder`.
- Explain a safety-critical medical, legal, financial, or security decision as
  though simplification removes uncertainty or professional ownership. This
  skill can explain the concepts, not replace the qualified decision-maker.

## Instructions

### Step 1: Identify the audience and purpose

Extract four fields from the request:

1. **Audience**: age, grade, education, role, relationship, or background.
2. **Goal**: understand, decide, teach, debug, collaborate, or summarize.
3. **Prior knowledge**: terms and mental models the audience already has.
4. **Depth**: quick intuition, practical working model, or nuanced explanation.

If the user says only `ELI5`, default to an age-five explanation. If the request
says only "explain" and no audience, do not force a childlike tone; preserve the
user's apparent level and ask a clarifying question only when the choice would
materially change the result.

Use [audience calibration](references/audience-calibration.md) for the baseline
profiles. Treat them as starting points, not stereotypes. A person's role or
age never proves what they know.

### Step 2: Understand the source before translating it

- For code, read the relevant implementation, call sites, and error context.
- For a document, identify the main claim, dependencies, and intended outcome.
- For an error, understand the likely cause and consequence before simplifying.
- For a concept, separate the core mechanism from optional detail.
- For a user-provided claim, distinguish what is given from what is verified.

Do not invent missing source facts. If the request requires an evidence audit,
verification, or test run before the explanation can be trusted, route that job
to `audit-verify-explain-grade-5` and use ELI5 only for the final audience
adaptation.

### Step 3: Choose the audience frame

Match what the audience needs:

| Audience | Lead with | Keep visible |
|---|---|---|
| young child | one concrete idea and a familiar object or activity | simple cause and effect |
| student | step-by-step model and defined terms | what changes at the next level |
| engineer | mechanism, interfaces, trade-offs, failure modes | proper terminology |
| manager | impact, risk, timeline, cost, decision | options and recommendation |
| designer | user behavior, flow, accessibility, feedback | experience consequence |
| executive | strategic effect, uncertainty, resource choice | decision and downside |
| family or friend | warm shared context | respect and practical relevance |

Do not put business framing into an engineer explanation or implementation
syntax into an executive explanation unless it changes the audience's decision.

### Step 4: Build the explanation in four layers

Use this order unless the user requests another format:

1. **What**: one sentence that captures the core idea.
2. **Analogy**: one familiar comparison that maps the important relationship.
3. **How**: only the details needed at this audience's depth.
4. **So what**: why it matters and what the audience should understand or decide.

For very simple audiences, use one idea per sentence and concrete nouns. For
technical audiences, keep the proper terms and focus on distinctions,
trade-offs, and edge cases. For decision-makers, quantify only when the source
provides defensible numbers.

### Step 5: Guard the analogy

An analogy is a bridge, not evidence. State where it stops matching when the
mismatch could create a wrong decision.

Good analogy checks:

- Does each important object map to a real concept?
- Does the cause-and-effect direction stay correct?
- Did the analogy introduce a promise the real system does not make?
- Did a fun detail replace the mechanism?
- Would the audience repeat a materially false claim after reading it?

Prefer no analogy over a catchy but misleading one.

### Step 6: Calibrate language and tone

- Define an essential technical term immediately, then use it consistently.
- Remove jargon that does not help the audience reason or decide.
- Keep uncertainty and safety caveats in plain language rather than deleting
  them.
- Never confuse simple language with childish tone.
- Never treat a nontechnical role as unintelligent.
- Match length to the requested depth, not merely to audience age.
- If the user used "dumb it down," simplify the material without echoing a
  demeaning frame.

### Step 7: Run the audience check

Before returning the explanation, verify:

1. the first sentence answers "what is it?";
2. every required term is defined at the point of use;
3. the analogy matches the mechanism and its limit is clear when needed;
4. the depth and vocabulary fit the named audience;
5. the final section explains why it matters to that audience;
6. no source claim, attribution, number, certainty, or caveat was invented;
7. the result does not drift into a tutorial, audit, or professional decision
   that belongs to another skill.

## Examples

### Example 1: Default ELI5

Request: "ELI5 what a database index is."

Lead with a simple lookup idea, use a picture-book contents page or labeled toy
box analogy, explain that the computer keeps an extra guide to find things
faster, and end with the trade-off that the guide takes space and needs updates.
Do not introduce B-trees unless the user asks for the next layer.

### Example 2: Manager audience

Request: "Explain API rate limiting to my manager."

Lead with user impact and the current request limit, frame the trade-off as
reduce calls versus buy more capacity, identify risk and timeline, and end with
the decision needed. Do not lead with headers, middleware, or token-bucket
implementation.

### Example 3: Engineer audience

Request: "Explain eventual consistency to a senior backend engineer."

Use the correct distributed-systems terminology, compare consistency models,
identify read/write and failure trade-offs, and discuss boundaries. Do not use
an age-five analogy unless it sharpens one distinction.

### Example 4: Route verification outward

Request: "Audit this performance fix, prove it is faster, then explain it to a
fifth grader."

Use `audit-verify-explain-grade-5` for the measurement and evidence. Apply this
skill only to adapt the verified result to the requested audience.

### Example 5: Safety-critical concept

Request: "Explain this treatment option to my parent in simple words."

Explain the provided clinical information and questions to ask, preserve risks
and uncertainty, protect personal data, and keep diagnosis and treatment choice
with the qualified clinician.

## Best practices

1. Understand first, translate second.
2. Calibrate to a real audience and purpose, not a stereotype.
3. Lead with purpose before mechanism or syntax.
4. Use one strong analogy instead of a pile of metaphors.
5. Define essential terms; remove decorative jargon.
6. Preserve caveats, uncertainty, numbers, and source attribution.
7. State analogy limits when they affect a decision.
8. Respect intelligence at every reading level.
9. Route audits and verification outward instead of pretending explanation is
   proof.
10. Re-read the final text as the named audience, not as the author.

## References

- [Audience calibration](references/audience-calibration.md)
- [Source, license, and evaluation](references/source-and-evaluation.md)
- [DreambigOu/ELI5](https://github.com/DreambigOu/ELI5)
- [Pinned upstream skill](https://github.com/DreambigOu/ELI5/blob/a766623b062331fdde53467001379b4ddf3acc2f/skills/eli5/SKILL.md)
