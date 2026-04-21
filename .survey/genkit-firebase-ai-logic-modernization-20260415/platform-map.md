# Platform Map: Genkit vs Firebase AI Logic modernization

## Settings
| Concern | Firebase AI Logic | Genkit | Common Layer |
|---------|-------------------|--------|--------------|
| Model selection | App-side model and generation settings via Firebase AI Logic docs | Framework-owned model/provider selection across GoogleAI, OpenAI, Anthropic, Ollama, etc. | Model choice and generation parameters |
| Safety / system controls | Safety settings, system instructions, quota, locations, pricing, monitoring surfaced directly in docs nav | Prompt/model settings inside flows plus deployment/runtime config | Prompt/system/model configuration |
| Deployment target | Primarily app SDK integration inside Firebase apps | Firebase, Cloud Run, or other backend/runtime targets | Runtime selection |

## Rules
| Concern | Firebase AI Logic | Genkit | Common Layer |
|---------|-------------------|--------|--------------|
| Client vs server boundary | Best for direct app integration; App Check and abuse prevention are explicit production rules | Best when backend ownership, tools, retrieval, and reusable orchestration rules matter | Decide where privileged logic lives |
| Workflow scope | Simple app feature paths are favored | Multi-step structured workflows are favored | Match framework weight to job complexity |
| Reuse | Mostly app-feature specific unless wrapped separately | Better for reusable backend logic across surfaces | Reusability boundary |

## Hooks
| Lifecycle | Firebase AI Logic | Genkit | Common Layer |
|-----------|-------------------|--------|--------------|
| Local development | App-feature integration and testing inside Firebase app workflows | Developer UI, CLI, traces, flow running, evaluation, local observability | Build/test/debug loop |
| Production hardening | App Check, quotas, monitoring, remote model changes | Deployment, flow execution, evaluation, observability, backend rollout | Production controls |
| Extension path | Add backend wrappers when feature complexity grows | Add more flows/tools/evals as orchestration grows | Incremental complexity management |

## Platform Gaps
- Firebase AI Logic and Genkit both live in the Firebase/Google AI ecosystem, but they do **not** align as two equivalent runtime wrappers.
- Firebase AI Logic maps cleanly to the **direct app integration** layer, while Genkit maps to the **backend workflow/orchestration** layer.
- The repo should treat them as adjacent but non-duplicate skills rather than parallel generic "Firebase AI" entries.
