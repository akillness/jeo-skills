---
name: agent-substrate
description: >-
  Operate agent-substrate/substrate, the Apache-2.0 Kubernetes-native platform for running
  AI coding agents at scale with stateful, suspendable sandbox actors, shared worker pools,
  and namespace-scoped resource management. Use when deploying or operating Agent Substrate
  on kind or GKE clusters, defining ActorTemplates and WorkerPools, managing actor lifecycle
  (suspend, resume, route), running demos (counter, Claude Code multiplex, multi-template,
  request parking), inspecting CRDs, or troubleshooting controller, proxy, or sandbox issues.
  Route kagent Agent/Harness CRDs and A2A Sessions to `kagent`, standalone Kubernetes cluster
  deployment to `deployment-automation`, and generic agent-team design to `harness2`.
  Triggers on: agent-substrate, substrate, ActorTemplate, WorkerPool, SubstrateProxy,
  ate-controller-manager, ate-proxy, sandbox actor, Claude Code multiplex, actor suspend resume,
  agent sandbox kubernetes, substrate kind cluster.
interface: cli
source: https://github.com/agent-substrate/substrate
---

# Agent Substrate

Operate the [Agent Substrate](https://github.com/agent-substrate/substrate) platform — a
Kubernetes-native system for running AI coding agents at scale. Substrate manages stateful,
suspendable sandbox actors in shared worker pools with automatic routing, state preservation
across suspend/resume cycles, and namespace-scoped resource management.

## Preflight

```bash
# Check prerequisites
command -v kubectl >/dev/null && echo "kubectl: $(kubectl version --client -o json 2>/dev/null | python3 -c 'import sys,json; print(json.load(sys.stdin)["clientVersion"]["gitVersion"])')" || echo "kubectl: missing"
command -v kind >/dev/null && echo "kind: $(kind version)" || echo "kind: missing (needed for local dev)"
command -v ko >/dev/null && echo "ko: $(ko version 2>&1 | head -1)" || echo "ko: missing (needed for building)"
command -v helm >/dev/null && echo "helm: $(helm version --short)" || echo "helm: missing"
kubectl get crd actortemplates.ate.dev 2>/dev/null && echo "CRDs: installed" || echo "CRDs: not found"
```

## Core Concepts

- **ActorTemplate** (`ate.dev/v1alpha1`): defines the container image, ports, environment,
  resource limits, and lifecycle hooks for a class of sandbox actors.
- **WorkerPool** (`ate.dev/v1alpha1`): a set of worker pods that host actor instances; multiple
  ActorTemplates can share a single WorkerPool.
- **Actor**: a running instance of an ActorTemplate inside a WorkerPool worker. Actors are
  stateful — their filesystem and process state survive suspend/resume cycles.
- **SubstrateProxy** (`ate.dev/v1alpha1`): the routing layer that maps external requests to
  the correct actor, creating or resuming actors on demand.
- **ate-controller-manager**: the Kubernetes controller that reconciles ActorTemplates,
  WorkerPools, and actor lifecycle.
- **ate-proxy**: the HTTP reverse proxy that routes traffic to actors by template and actor ID.

## Local Development (kind)

```bash
# Clone and set up a local kind cluster with a local registry
git clone https://github.com/agent-substrate/substrate.git
cd substrate
./hack/create-kind-cluster.sh

# Build and deploy to the kind cluster
ko apply -f config/

# Verify the controller is running
kubectl -n ate-system get pods

# Tear down
./hack/delete-kind-cluster.sh
```

## GKE Deployment

For production GKE installation, follow the
[GKE Installation Guide](https://docs.cloud.google.com/kubernetes-engine/ai-ml/install-overview-substrate)
and the [substrate-gke](https://github.com/ai-on-gke/substrate-gke) repository.

## Demos

| Demo | Purpose |
|---|---|
| [Counter](demos/counter/) | Stateful Go HTTP server — state preservation across suspend/resume, on-demand actor routing |
| [Claude Code Multiplex](demos/claude-code-multiplex/) | Oversubscribe hardware by multiplexing multiple Claude Code agents onto a limited worker pool |
| [Multi-Template](demos/multi-template/) | Two ActorTemplates sharing one WorkerPool across different namespaces |
| [Request Parking](demos/request-parking/) | Queue requests while actors are suspended; resume and deliver when ready |
| [Substrate and Kagent](demos/substrate-and-kagent/) | Integrate Substrate sandboxes with kagent AI agents |

## Routing

- Route kagent CRDs (Agent, AgentTemplate, Harness, Sessions) → `kagent`
- Route generic Kubernetes cluster deployment → `deployment-automation`
- Route generic agent-team design → `harness2`
- Route A2A protocol design → `a2a-protocol`

## References

- [Apache 2.0 License](https://github.com/agent-substrate/substrate/blob/main/LICENSE)
- [Contributing Guide](https://github.com/agent-substrate/substrate/blob/main/CONTRIBUTING.md)
- [GKE docs](https://docs.cloud.google.com/kubernetes-engine/ai-ml/install-overview-substrate)
