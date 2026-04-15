# Platform Map: Firebase AI lane normalization

## Settings
| Concern | Firebase AI Logic | Genkit | Firebase CLI / Ops layer | Common Layer |
|---------|-------------------|--------|---------------------------|--------------|
| Model choice | App/client SDK chooses model in app integration code | Flow/app code chooses model/provider plugin | N/A | `settings` |
| Safety / generation controls | Prompt/system/model parameters for in-app features | Prompt/model/tool/flow configuration for backend workflows | N/A | `settings` |
| Streaming / structured output | Direct app/client SDK concern | Flow/runtime concern, often exposed to clients via server endpoints | N/A | `settings` |
| Runtime placement | App/mobile/web runtime | Server/runtime deployment target | Project/deploy environment | `settings` |

## Rules
| Concern | Firebase AI Logic | Genkit | Firebase CLI / Ops layer | Common Layer |
|---------|-------------------|--------|---------------------------|--------------|
| Security boundary | App Check, client abuse prevention, input/privacy guardrails | Auth policies, server authz, tool/RAG/data access controls | Project IAM / deploy permissions | `rules` |
| Scope guardrail | Keep work inside direct app/client integration when possible | Move to backend when tool use, RAG, evals, or reusable flows appear | Keep ops tasks out of model/workflow skills | `rules` |
| Cost / quota | App-facing rate/usage/cost awareness | Server workload + eval/trace cost awareness | Billing/project controls | `rules` |

## Hooks
| Lifecycle | Firebase AI Logic | Genkit | Firebase CLI / Ops layer | Common Layer |
|-----------|-------------------|--------|---------------------------|--------------|
| Development loop | integrate feature in app UI, test in app context | define flow/tool/prompt, inspect in developer UI | run project/dev/deploy commands | `hooks` |
| Escalation hook | hand off to `genkit` when backend orchestration appears | expose callable/server endpoint back to app when needed | deploy/configure the chosen runtime | `hooks` |
| Monitoring hook | app-side usage and Firebase monitoring | traces, evals, observability, runtime metrics | project/service deploy health | `hooks` |

## Platform Gaps
- Firebase AI Logic and Genkit share ecosystem branding, but they do **not** own the same workflow layer.
- Firebase CLI is related operationally but should stay a route-out, not a peer solution for prompt/model/workflow design.
- A repo skill that ignores this normalization will drift back into a generic Firebase AI catch-all.
