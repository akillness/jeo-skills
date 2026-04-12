# Platform Map: Frontend legacy anchor modernization

## Settings
| Concern | `ui-component-patterns` | `responsive-design` | Other skill / common layer | Common Layer |
|---------|--------------------------|---------------------|----------------------------|--------------|
| Primitive/component API shape | Owns | Route out | `design-system` when it becomes cross-system governance | Reusable UI architecture |
| Variants, slots, composition, controlled/uncontrolled boundaries | Owns | Route out | `state-management` only if the real issue is broader data ownership | Reusable UI architecture |
| Responsive behavior inside a component | Mention as a constraint | Owns the detailed breakpoint/container/layout strategy | `web-accessibility` for zoom/reflow or target-size remediation | Shared frontend concern |
| Design tokens / system-wide primitives | Route out | Route out | `design-system` | System governance |
| Rendering performance / hydration / rerenders | Route out | Route out | `react-best-practices` | Runtime performance |
| Accessibility remediation | Constraint / route-out | Constraint / route-out | `web-accessibility` | Verification + compliance |

## Rules
| Concern | `ui-component-patterns` | `responsive-design` | Other skill / common layer | Common Layer |
|---------|--------------------------|---------------------|----------------------------|--------------|
| Trigger on reusable component questions | Yes | No | — | Clear route-in |
| Trigger on layout-only breakpoint/media/container questions | No | Yes | — | Clear route-in |
| Trigger on “review this UI broadly” | No | No | `web-design-guidelines` | Broad audit ownership |
| Trigger on primitive extraction / variant sprawl / slot API design | Yes | No | `design-system` if system-level governance dominates | Reuse boundary |
| Trigger on mobile layout collapse / card-to-list/table overflow/media sizing | Constraint only | Yes | `web-accessibility` if semantics/target-size/reflow failures dominate | Layout boundary |
| Trigger on keyboard/focus/ARIA/labels/manual a11y checks | No | No | `web-accessibility` | Accessibility boundary |

## Hooks
| Lifecycle | `ui-component-patterns` | `responsive-design` | Other skill / common layer | Common Layer |
|-----------|--------------------------|---------------------|----------------------------|--------------|
| Intake | Classify whether the user needs a reusable primitive, a local component refactor, or a system-level pattern | Classify whether the user needs viewport/container/layout adaptation | Split mixed requests early | Frontend triage |
| Analysis | Build a component API/variant/state matrix and note route-outs | Build a layout/breakpoint/container/media strategy and note route-outs | Pull in accessibility or system concerns explicitly | Boundary enforcement |
| Output | Produce a component brief, ownership split, and implementation guidance | Produce a responsive layout brief and verification plan | Route to neighboring skills when needed | Actionable packet |
| Verification | Check API clarity, variant coverage, and boundary correctness | Check breakpoints/container behavior, responsive media, and layout regression risk | Accessibility/manual review where appropriate | Verification split |

## Platform Gaps
- `ui-component-patterns` currently under-specifies route-outs to `design-system`, `web-accessibility`, `state-management`, `responsive-design`, and `react-best-practices`.
- `responsive-design` is still broad and legacy-heavy, but its best role is *narrower* than a full reusable component architecture skill.
- Discovery docs still undersell the distinction between reusable primitive/API work and broader design/audit work.
- The cleanest next abstraction is: **`ui-component-patterns` owns reusable component architecture; `responsive-design` owns layout adaptation; neighboring skills own accessibility, performance, system governance, and broad UI review.**
