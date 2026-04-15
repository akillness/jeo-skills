# Lane B — Solutions landscape for `autoresearch`

## Scope
This note inventories adjacent solutions that users may confuse with the oh-my-skills `autoresearch` skill, with emphasis on:
1. Karpathy/autoresearch itself
2. repo-native wrappers and workflows already inside this skill
3. nearby eval / tracing / observability tools and hosted products

Primary question: **should `.agent-skills/autoresearch` stay narrowly ML-experiment-specific, or broaden into generic prompt/skill eval?**

## Executive conclusion
`autoresearch` should stay **strictly scoped to Karpathy-style autonomous ML experimentation**:
- one mutable training file (`train.py`)
- one frozen evaluation harness (`prepare.py`, `TIME_BUDGET`, validation shard)
- one scalar objective (`val_bpb`)
- one git-ratcheting loop over real GPU experiments

That operating model is materially different from generic prompt-eval / skill-eval / LLM observability products, which optimize for **datasets, judges, traces, prompts, review queues, red-teaming, and release confidence** rather than **overnight architecture/optimizer search under a fixed training budget**.

If the skill blends those jobs, it becomes harder to trigger correctly and easier to misroute users who really need `skill-autoresearch`, `langsmith`, or other eval tooling.

---

## Category 1 — Canonical solution: Karpathy/autoresearch

### What it is
Source: Karpathy README and repo metadata
- Repo: https://github.com/karpathy/autoresearch
- README raw: https://raw.githubusercontent.com/karpathy/autoresearch/master/README.md
- GitHub API metadata: https://api.github.com/repos/karpathy/autoresearch

Key source-backed traits:
- Described as "AI agents running research on single-GPU nanochat training automatically".
- Core files are deliberately minimal: `prepare.py`, `train.py`, `program.md`.
- Agent edits **only** `train.py`; human iterates **`program.md`**.
- Runs have a fixed **5-minute** budget.
- Optimization metric is **`val_bpb`**.
- Platform support is officially **single NVIDIA GPU**, with community forks for MacOS/MLX, Windows RTX, AMD.

### Strengths
- **Exceptionally crisp search loop.** One file to mutate, one metric, one time budget, one keep/discard rule.
- **Real ML experimentation, not synthetic scoring.** Improvements come from actually training and evaluating models.
- **High anti-drift discipline.** Fixed budget + fixed harness + git ratchet make experiments comparable.
- **Low conceptual overhead.** The README explicitly frames `program.md` as the human-controlled research program.

### Weaknesses / constraints
- **Hardware-heavy.** Official path expects a CUDA-capable NVIDIA GPU; H100 is the tested target.
- **Platform comparability is local, not universal.** README notes results are not directly comparable across different compute platforms.
- **Single objective.** Great for training search, weak for multi-objective product-quality questions.
- **Narrow operational surface.** Does not try to be a hosted eval stack, dataset manager, or prompt registry.

### Why it matters for the skill
The oh-my-skills `autoresearch` skill should mirror this boundary. The strongest value is not “self-improvement” in general; it is **Karpathy-style ML experiment operations**.

---

## Category 2 — Repo-native wrappers inside `.agent-skills/autoresearch`

### What already exists
Local sources:
- Skill: `.agent-skills/autoresearch/SKILL.md`
- Scripts:
  - `.agent-skills/autoresearch/scripts/setup.sh`
  - `.agent-skills/autoresearch/scripts/check-hardware.sh`
  - `.agent-skills/autoresearch/scripts/run-experiment.sh`
  - `.agent-skills/autoresearch/scripts/run-loop.sh`
  - `.agent-skills/autoresearch/scripts/show-results.sh`
- References:
  - `.agent-skills/autoresearch/references/architecture.md`
  - `.agent-skills/autoresearch/references/hardware-config.md`
  - `.agent-skills/autoresearch/references/program-md-guide.md`

### What these wrappers add
- `setup.sh` turns the upstream README into an installable flow: install `uv`, clone Karpathy repo, sync deps, optionally patch sequence length, run `prepare.py`.
- `check-hardware.sh` checks NVIDIA GPU, VRAM, CUDA, Python, and `uv`, then emits JSON readiness data.
- `run-experiment.sh` standardizes a single run, log capture, timeout handling, and extraction of `val_bpb` / `peak_vram_mb`.
- `run-loop.sh` formalizes the keep/revert ratchet and appends every run to `results.tsv`.
- Reference docs explain architecture invariants, hardware tuning, and `program.md` authoring.

### Strengths
- **Bridges concept to action.** Users do not need to infer shell steps from the upstream README.
- **Makes boundary visible.** Local references already emphasize immutable harness, fixed `TIME_BUDGET`, and `val_bpb`.
- **Supports constrained hardware decision-making.** The hardware guide and check script are concrete and reusable.

### Weaknesses / gaps
- **No eval harness yet for the skill itself.** The survey charter correctly notes there is no `evals/evals.json`.
- **Some reference content appears placeholder-ish in spots** (e.g. `EVAL_TOKENS=***`), which weakens trust.
- **Risk of trigger confusion** with `skill-autoresearch`, because both use the word “autoresearch” and both talk about ratchets/keep-revert loops.

### Recommendation
Lean further into the repo-native operator packet:
- install / hardware / program authoring / run / interpret
- explicit route-outs for prompt-eval, skill-eval, tracing, and hosted experimentation products

Do **not** turn this skill into a generic benchmark framework.

---

## Category 3 — Repo-local skill optimization (`skill-autoresearch`)

### What it is
Local sources:
- `.agent-skills/skill-autoresearch/SKILL.md`
- `setup-all-skills-prompt.md` lines 386-387 distinguish `autoresearch` from `skill-autoresearch`

Source-backed distinction:
- `autoresearch`: “Karpathy autonomous ML — overnight GPU experiments, ratchets improvements via git”
- `skill-autoresearch`: “Repo-local skill ratcheting — freeze evals, mutate one thing at a time, keep or revert by score”

`skill-autoresearch` itself explicitly says it is for **repo-local skill maintenance** and routes hosted eval needs to tools like **LangSmith, Braintrust, Weave, or Promptfoo**.

### Strengths
- Strong for deterministic prompt sets, binary evals, changelogs, dashboards, and support-file ratchets.
- Low hardware barrier.
- Correct fit for improving `SKILL.md` assets.

### Weaknesses relative to ML autoresearch
- Does **not** run real training experiments.
- Does **not** own GPU hardware tuning, VRAM budgets, `train.py`, or `val_bpb`.
- Can reuse the ratchet metaphor, but not the ML workload.

### Why the boundary matters
This is the nearest internal confusion risk. If `autoresearch` starts talking like a generic eval loop, users may incorrectly trigger it for skill benchmarking. The safer split is:
- **`autoresearch`** = autonomous ML training experiments
- **`skill-autoresearch`** = repo-local skill mutation + eval ratchets

---

## Category 4 — Generic LLM eval / tracing / observability tools
These are adjacent, but not substitutes for Karpathy-style ML experiment ops.

### 4A. LangSmith
Sources:
- Official docs: https://docs.langchain.com/langsmith/evaluation-concepts
- Local skill: `.agent-skills/langsmith/SKILL.md`

Official docs frame LangSmith evals around:
- offline and online evaluations
- datasets, examples, experiments
- runs, threads, evaluators
- human / code / LLM-as-judge evaluation

#### Strengths
- Excellent for **LLM app lifecycle quality measurement**.
- Strong on **traces, datasets, evaluator design, human feedback, experiment comparison**.
- Works well when the problem is release confidence for an app, agent, or RAG system.

#### Weaknesses relative to `autoresearch`
- Solves **application eval**, not architecture search under a fixed training harness.
- No native concept of “edit `train.py`, train for 300s, keep by lower `val_bpb`”.
- Easier to overuse as a general AI control plane if boundaries are not explicit.

#### Why it should route out
If a user wants trace trees, judge rubrics, dataset-backed regression gates, or online review queues, they want LangSmith-like tooling, not the `autoresearch` skill.

### 4B. Promptfoo
Sources:
- README: https://raw.githubusercontent.com/promptfoo/promptfoo/main/README.md
- Docs root: https://www.promptfoo.dev/docs/getting-started/

Promptfoo describes itself as a **CLI and library for evaluating and red-teaming LLM apps**.

#### Strengths
- Strong CLI-first eval surface.
- Good for prompt/model comparisons, CI/CD gating, and red-teaming.
- Local-first execution is attractive for privacy-sensitive workflows.

#### Weaknesses relative to `autoresearch`
- Optimizes prompts, model outputs, and security posture; not ML training loops.
- Assumes provider/API evaluation workflows more than GPU-bound architectural search.
- No built-in notion of immutable training harness + ratcheted git history over `train.py` edits.

#### Why it should route out
If the request sounds like “evaluate prompts,” “compare model outputs,” or “add red-team checks in CI,” that is Promptfoo territory, not ML autoresearch.

### 4C. Braintrust
Sources:
- SDK README: https://raw.githubusercontent.com/braintrustdata/braintrust-sdk-javascript/main/README.md
- Docs: https://www.braintrust.dev/docs

Braintrust positions itself as a platform for **evaluating and shipping AI products**, with SDK support for logging, tracing, evals, and CLI workflows.

#### Strengths
- Strong productization story for AI systems.
- Useful when teams need eval runs, scoring, tracing, and shared operational workflows.
- Better fit than `autoresearch` for collaborative release processes around AI products.

#### Weaknesses relative to `autoresearch`
- Product-eval substrate, not a training-search loop.
- Assumes tasks/scores/examples, not a fixed 300-second CUDA training harness.
- Broader and heavier than the narrowly scoped ML experiment operator packet.

### 4D. DeepEval
Sources:
- README: https://raw.githubusercontent.com/confident-ai/deepeval/main/README.md
- Docs: https://deepeval.com/docs/getting-started

DeepEval describes itself as an open-source **LLM evaluation framework**, "similar to Pytest but specialized for unit testing LLM apps," with judge metrics like G-Eval, task completion, answer relevancy, hallucination, etc.

#### Strengths
- Clear developer mental model for test-like LLM evaluation.
- Strong metric catalog for agents, RAG, hallucination, answer relevance.
- Good fit for prompt/app regression checks.

#### Weaknesses relative to `autoresearch`
- Evaluates **LLM systems**, not low-level training code search.
- Judge-based and rubric-based; not centered on actual training loss under a fixed runtime budget.
- Encourages metric composition rather than single-harness comparability.

### 4E. Phoenix (Arize)
Sources:
- README: https://raw.githubusercontent.com/Arize-ai/phoenix/main/README.md
- Docs: https://arize.com/docs/phoenix/

Phoenix presents itself as an open-source AI observability platform for **tracing, evaluation, datasets, experiments, playground, and prompt management**.

#### Strengths
- Strong combined observability + evaluation + experiments story.
- Vendor/language agnostic and deployable locally or in cloud.
- Good fit for tracing and debugging production-ish LLM systems.

#### Weaknesses relative to `autoresearch`
- Broad observability surface can blur into platform operations rather than bounded ML search.
- Focus is prompt / retrieval / trace / experiment visibility, not `train.py` evolution and `val_bpb` ratchets.

### 4F. Humanloop
Sources:
- Docs: https://humanloop.com/docs
- Home/announcement: https://humanloop.com/

Humanloop docs describe the platform as an **LLM Evals Platform for Enterprises**, centered on **Evaluation, Prompt Management, and Observability**, with both UI-first and code-first workflows.

#### Strengths
- Clear enterprise positioning around collaborative eval workflows.
- Good example of the product category users may mean when they say “eval platform”.

#### Weaknesses / caution
- The official site says the Humanloop platform is being **sunset** and the team joined Anthropic.
- This makes it useful mainly as category evidence, not as a strong recommendation target.

---

## Repeated limitations across adjacent solutions
Across LangSmith, Promptfoo, Braintrust, DeepEval, Phoenix, and Humanloop, the repeated pattern is:

1. **They evaluate applications, prompts, traces, or product behavior** more than training-code evolution.
2. **They rely on datasets, judges, rubrics, and review workflows** more than a single immutable training harness.
3. **They optimize release confidence and observability**, not overnight architecture/optimizer search on a real GPU.
4. **They are often multi-objective**, whereas Karpathy/autoresearch is intentionally single-objective (`val_bpb`).
5. **They treat “experiment” as prompt/model/app comparison**, not "edit one training file, run for 300s, keep by scalar loss".

That repeated mismatch is the strongest argument for keeping `autoresearch` narrow.

---

## Confusion risks to design against

### Most likely misroutes
1. **"Eval my skill / improve this skill"** → should trigger `skill-autoresearch`, not `autoresearch`.
2. **"Add LLM evals / traces / regression checks"** → should trigger `langsmith`, Promptfoo-like tools, Braintrust, DeepEval, or Phoenix.
3. **"Compare prompts/models for my app"** → not `autoresearch`.
4. **"Run autonomous GPU experiments on `train.py` with `program.md` and `val_bpb`"** → this is the canonical `autoresearch` job.

### Boundary sentence worth preserving
The skill should keep repeating some variant of:
> Use this only for Karpathy-style autonomous ML experimentation on a training repo with a fixed runtime budget and metric; not for prompt evaluation, generic LLM app eval, observability, or repo-local skill mutation.

---

## Implications for hardening `.agent-skills/autoresearch`

### Keep / strengthen
- Karpathy provenance and terminology (`program.md`, `train.py`, `val_bpb`, fixed 300-second budget)
- hardware + VRAM + CUDA readiness guidance
- immutable-harness rules
- git-ratcheting explanation
- route-outs to `skill-autoresearch` and hosted eval/tracing categories

### Avoid adding
- generic prompt benchmarking language
- vague “self-improving skill” framing
- judge-based eval terminology as the core story
- broad app-observability/tracing responsibilities

### Recommended routing language
- **Skill benchmarking or `SKILL.md` optimization** → `skill-autoresearch`
- **LLM app traces / datasets / online-offline evals** → `langsmith` or comparable eval/observability tooling
- **Prompt CI / red-teaming / prompt comparisons** → Promptfoo-like tooling
- **Enterprise prompt/eval/observability platform decisions** → Braintrust / Phoenix / Humanloop-category tools

---

## Bottom line
The best hardening move is not to make `autoresearch` more general. It is to make it **more unmistakably specific**:
- autonomous **ML** experiments
- real **GPU** training
- fixed **training** harness
- scalar **`val_bpb`** optimization
- git **ratcheting** on `train.py`
- human-written **`program.md`** as research charter

Everything else should route out.
