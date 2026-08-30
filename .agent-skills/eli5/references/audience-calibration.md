# Audience Calibration

Use these profiles as starting hypotheses. The user's stated knowledge,
examples, and purpose override age or job stereotypes.

## Intake card

Record:

```text
audience:
goal:
prior knowledge:
decision or action:
depth:
required terms:
terms to avoid or define:
source confidence:
```

If the audience is not stated:

- explicit `ELI5` means age-five style by default;
- generic "explain" keeps the user's apparent level;
- ask only when the audience choice materially changes the result.

## Age profiles

| Audience | Vocabulary and sentence shape | Useful frames | Avoid |
|---|---|---|---|
| age 5 | common words, one idea per short sentence | toys, animals, boxes, playground, picture books | jargon, abstractions, fake precision |
| age 10 | simple cause and effect, short steps | school, sports, games, group tasks | baby talk, unexplained technical terms |
| age 15 | moderate abstraction, natural casual tone | phones, social apps, gaming, school projects | forced slang or "fellow kids" tone |
| young adult | direct practical language | work, money, travel, daily tools | assuming no technical knowledge |
| mature adult | respectful and concrete | career, home, family, long-term trade-offs | patronizing simplification |

Age is not knowledge. A child can know a domain deeply, and an adult can be new
to it. Use evidence from the request.

## Education profiles

| Audience | Baseline depth | Treatment of terminology |
|---|---|---|
| fifth grade | concrete sequence and visible outcomes | avoid or define immediately |
| middle school | basic models and step-by-step logic | introduce a few terms with examples |
| high school | moderate abstraction and comparisons | use proper terms after a plain definition |
| college | theory plus practical application | assume general academic literacy, not domain expertise |
| graduate | nuance, assumptions, methods, edge cases | use precise domain terms and state trade-offs |

Do not inflate vocabulary merely to sound academic. Technical precision comes
from relationships and boundaries, not longer words.

## Professional profiles

### Manager

Cares about impact, timeline, risk, cost, ownership, and what decision is
needed. Lead with the outcome. Include implementation only when it changes
scope, confidence, or timing.

### Engineer

Cares about mechanism, interface, architecture, constraints, failure modes,
performance, and maintainability. Use proper terms. Skip elementary background
they clearly know.

### Designer

Cares about user behavior, flow, visual or interaction feedback, accessibility,
and edge states. Explain how the mechanism becomes a user experience.

### Product manager

Cares about user value, scope, priority, dependencies, evidence, and what to
build or skip. Connect the concept to user stories and decision criteria.

### Director or executive

Cares about strategy, resource allocation, risk, ROI, market or organizational
impact, and reversible options. Lead with the decision and downside. Do not
claim numeric ROI without source evidence.

### Colleague

Cares about shared context, handoffs, dependencies, and what changes in their
work. Use team vocabulary the request establishes.

## Relationship profiles

| Audience | Tone | Useful frame | Guardrail |
|---|---|---|---|
| partner or spouse | warm, patient, conversational | shared routines and decisions | do not assume household roles |
| parent | respectful, clear, practical | familiar tools and home examples | do not equate age with low ability |
| child | encouraging, concrete, brief | play, school, stories, animals | keep safety and truth intact |
| friend | casual and direct | shared interests or culture | do not force humor |

## Four-layer response card

```text
What: one-sentence core idea
Analogy: one familiar relationship
How: the smallest useful mechanism
So what: relevance, decision, or next understanding
```

For technical audiences, the analogy can be a comparison with a known system
rather than a household metaphor.

## Analogy quality checks

A good analogy has explicit mappings:

```text
analogy object A -> real concept A
analogy action B -> real mechanism B
analogy outcome C -> real consequence C
limit -> where the analogy stops matching
```

Reject an analogy when it reverses cause and effect, implies guaranteed
behavior, deletes a safety condition, or makes the audience remember a false
mechanism.

## Language checks

### Simple audiences

- one main idea per sentence;
- concrete nouns and active verbs;
- define a necessary term at first use;
- repeat the stable term instead of rotating synonyms;
- keep numbers only when they matter and explain their scale;
- short does not mean incomplete.

### Technical audiences

- use the standard vocabulary;
- identify assumptions and system boundary;
- compare alternatives and trade-offs;
- include edge cases that change the model;
- avoid wasting space on facts the audience already knows.

### Decision-makers

- lead with effect and choice;
- distinguish fact, forecast, and recommendation;
- name owner, risk, timing, and dependency when known;
- preserve uncertainty;
- avoid implementation detail that does not change a decision.

## Safety-critical explanations

For medical, legal, financial, security, or physical-safety topics:

- explain provided facts and terminology;
- preserve warnings, uncertainty, and source limits;
- do not turn simple language into a directive;
- do not invent personalized advice;
- keep the qualified decision owner visible;
- protect sensitive data;
- recommend the appropriate professional or official source when the decision
  exceeds explanatory scope.
