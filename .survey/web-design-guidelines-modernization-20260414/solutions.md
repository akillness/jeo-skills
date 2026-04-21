# Solution Landscape: web-design-guidelines modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Vercel Web Interface Guidelines | Curated rule catalog for web-interface review | Concrete, implementation-facing, covers accessibility/focus/forms/motion/perf/responsive concerns in one place | Vendor-flavored wording; weak on audit triage and boundary routing by itself | Good source bundle, weak as the entire skill workflow |
| NN/G 10 Usability Heuristics | Heuristic review framework | Durable mental model for feedback, system status, consistency, error prevention, clarity | Too abstract alone; not implementation-ready without a checklist | Best for framing review categories and findings |
| W3C accessibility tool ecosystem | Tool inventory / capability map | Shows automated + manual + CI/plugin categories; useful for deciding what can be scanned | Accessibility-only; not a full UI quality review workflow | Confirms automation is a lane, not the whole audit |
| UI audit checklist templates (example: Roast My Web) | Structured manual audit checklist + report outline | Strong on audit scoping, sections, and handoff packets; covers layout, CTAs, states, responsiveness, perf, accessibility basics | Generic and not repo-specific; can drift into marketing-site advice | Good pattern for output format and review categories |
| Repo-local neighboring skills (`web-accessibility`, `responsive-design`, `ui-component-patterns`, `design-system`, `react-best-practices`) | Specialized adjacent anchors | Strong route-outs once the broad UI problem is classified | None of them should own broad interface review alone | The right move is boundary sharpening, not another new frontend wrapper |

## Categories
- **Rule source / checklist:** Vercel Web Interface Guidelines
- **Heuristic framing:** NN/G 10 usability heuristics
- **Automated scanner layer:** W3C-listed accessibility tool ecosystem (axe, Lighthouse, plugins, CI, etc.)
- **Audit packet / report structure:** UI audit checklist templates such as Roast My Web
- **Repo-local specialist route-outs:** accessibility, responsive layout, component APIs, design-system governance, React behavior

## What People Actually Use
Broad UI reviews in practice are mixed-mode:
- one checklist or guideline source for consistency,
- one heuristic frame for judging clarity and feedback,
- one or more automated tools for accessibility/perf basics,
- human judgment for hierarchy, CTA clarity, interaction-state quality, and route-outs.

The useful pattern is **audit packet + category classification + explicit handoffs**, not “run one rules file and paste violations.”

## Frequency Ranking
1. **Manual checklist + audit packet** — recurring across UI-audit guidance because broad interface quality is not fully automatable.
2. **Heuristic framing** — recurring because teams need broad review categories beyond implementation details.
3. **Automated accessibility/perf tooling** — important but secondary; they confirm part of the review, not all of it.
4. **Repo-local specialist handoffs** — critical for this repository because the frontend lane is already decomposed into sharper anchors.

## Key Gaps
- The current skill has no first-class review taxonomy for hierarchy, states, consistency, responsiveness, accessibility basics, and performance signals.
- It does not tell agents when to stop and route into `web-accessibility`, `responsive-design`, `ui-component-patterns`, `design-system`, or `react-best-practices`.
- It lacks a reusable review packet format, so findings can become noisy and hard to act on.
- It lacks support files and evals even though the lane is high-visibility.

## Contradictions
- **Marketed claim:** a single guideline source is enough.  
  **Observed reality:** broad UI review still needs manual heuristic judgment and route-outs.
- **Marketed claim:** “check accessibility” is the same as broad UI review.  
  **Observed reality:** accessibility is one slice of the broader audit, not the whole job.
- **Marketed claim:** broad UI review can stay vendor-specific.  
  **Observed reality:** the best reusable workflow is vendor-neutral classification plus optional rule-source overlays.

## Key Insight
The best bounded upgrade is to turn `web-design-guidelines` into the **broad interface audit / design-review anchor** for page and flow reviews: classify the review surface, combine heuristic judgment with practical checklist categories, use automation as supporting evidence rather than the whole answer, and route specialized remediation to neighboring frontend skills. That is more transferable than either leaving the skill as a Vercel-only fetcher or adding another overlapping frontend review wrapper.
