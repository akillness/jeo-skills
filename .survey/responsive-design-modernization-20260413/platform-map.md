# Platform Map: Responsive design modernization

## Settings
| Concern | `responsive-design` | `ui-component-patterns` | Other skill / common layer | Common Layer |
|---------|---------------------|--------------------------|----------------------------|--------------|
| Mobile-first layout adaptation | Owns | Constraint only | — | Responsive strategy |
| Container queries / intrinsic layout / media sizing | Owns | Constraint only | `design-system` if policy spans many primitives | Layout architecture |
| Reusable primitive/component API shape | Route out | Owns | — | Component architecture |
| Zoom/reflow/touch-target remediation | Constraint / route-out | Constraint / route-out | `web-accessibility` | Accessibility verification |
| Broad UI critique / rule audit | Route out | Route out | `web-design-guidelines` | Review layer |
| System-wide breakpoint/tokens governance | Route out | Route out | `design-system` | System governance |

## Rules
| Concern | `responsive-design` | `ui-component-patterns` | Other skill / common layer | Common Layer |
|---------|---------------------|--------------------------|----------------------------|--------------|
| Trigger on layout collapse, overflow, wrapping, responsive media, breakpoint strategy | Yes | No | — | Clear route-in |
| Trigger on component variant/slot/API design | No | Yes | — | Clear route-in |
| Trigger on “review this interface broadly” | No | No | `web-design-guidelines` | Broad audit ownership |
| Trigger on zoom/reflow, touch target, keyboard/focus, semantic remediation | No | No | `web-accessibility` | Accessibility boundary |
| Trigger on cross-app breakpoint/tokens rules | No | No | `design-system` | Governance boundary |

## Hooks
| Lifecycle | `responsive-design` | `ui-component-patterns` | Other skill / common layer | Common Layer |
|-----------|---------------------|--------------------------|----------------------------|--------------|
| Intake | Classify viewport/container/layout adaptation problems | Classify reusable primitive/API questions | Split mixed requests early | Frontend triage |
| Analysis | Build a layout strategy: mobile-first baseline, flexible primitives, container vs viewport decisions, verification plan | Build a component API/variant/state matrix | Pull accessibility and governance issues out explicitly | Boundary enforcement |
| Output | Produce a responsive layout brief and test checklist | Produce a component architecture packet | Route mixed concerns to neighboring skills | Actionable packet |
| Verification | Check overflow, wrapping, density, responsive media, and breakpoint/container behavior | Check API clarity, variant coverage, and ownership splits | Accessibility/manual review where needed | Verification split |

## Platform Gaps
- The current `responsive-design` skill under-specifies route-outs and over-acts like a general CSS tutorial.
- Container-query and intrinsic-layout guidance are missing despite being part of the modern responsive toolkit.
- Discovery docs do not distinguish responsive layout adaptation from component API architecture or broad UI review.
- The clean abstraction is: **`responsive-design` owns layout adaptation + verification; `ui-component-patterns` owns reusable component APIs; neighboring skills own accessibility, system governance, and broad review.**
