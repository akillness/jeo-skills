# Release Packet Templates

Use these packet skeletons when `deployment-automation` has already chosen the right mode.

## Preview release packet

```markdown
# Preview Release Packet

## Target
- Provider/runtime:
- URL/output:
- What reviewers must verify:

## Preconditions
- Build/test status:
- Required config present:
- Known differences from staging/prod:

## Deploy steps
1. ...
2. ...
3. ...

## Verification
- Smoke checks:
- Visual / flow checks:
- Promote or discard decision:

## Route-outs
- Provider-specific follow-up:
- Adjacent skills if needed:
```

## Environment promotion packet

```markdown
# Environment Promotion Packet

## Artifact and environments
- Artifact:
- Promote from:
- Promote to:
- Promotion model:

## Gates
- Required approvals:
- Freeze/change-window notes:
- Blocking risks:

## Rollout
1. ...
2. ...
3. ...

## Verification
- Before promotion:
- After promotion:
- Stop conditions:

## Rollback
- Immediate rollback path:
- Data/schema caveats:
```

## Container/PaaS rollout packet

```markdown
# Container/PaaS Rollout Packet

## Runtime
- Image/build source:
- Platform:
- Release command or provider action:

## Release plan
- Direct deploy or staged rollout:
- Verification checks:
- Rollback path:

## Handoffs
- Provider-specific follow-up:
- Adjacent skills if needed:
```

## Kubernetes rollout packet

```markdown
# Kubernetes Rollout Packet

## Delivery surface
- Manifest source:
- Deployment/controller:
- Strategy:

## Preflight
- Image/tag:
- Namespace/env:
- Migration/secrets assumptions:

## Rollout
- Apply/promote steps:
- Readiness and health checks:
- Stop conditions:

## Rollback
- Previous ReplicaSet/version:
- Traffic/data caveats:
```

## Rollback response packet

```markdown
# Rollback Response Packet

## Failure signal
- What failed:
- Blast radius:
- Confidence:

## Immediate containment
1. ...
2. ...
3. ...

## Recovery path
- Redeploy previous artifact / switch traffic / disable flag:
- Data/schema caveats:

## Verification after recovery
- Health:
- Smoke:
- Follow-up hardening:
```

## Release hardening packet

```markdown
# Release Hardening Packet

## Current path
- Existing deploy trigger:
- Current sign-off:
- Current rollback method:

## Missing safety controls
- Preflight gaps:
- Verification gaps:
- Approval / audit gaps:
- Stop-condition gaps:

## Minimal hardening plan
1. ...
2. ...
3. ...

## Follow-up route-outs
- CI authoring:
- Observability:
- Provider-specific operations:
```
