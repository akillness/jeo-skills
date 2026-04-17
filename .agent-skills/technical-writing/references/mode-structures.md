# Technical Writing Mode Structures

Use these as default section skeletons after `technical-writing` picks the primary mode.

## Technical spec
```markdown
# <Feature / Change> Technical Specification

## Overview
## Problem
## Goals
## Non-goals
## Constraints
## Proposed design
## Interfaces / dependencies
## Risks and mitigations
## Rollout and rollback
## Open questions
```

## Architecture document
```markdown
# <System> Architecture

## Context
## Responsibilities and boundaries
## Components
## Data / request flow
## Key decisions
## Failure modes
## Operational considerations
## Known limits / future changes
```

## ADR
```markdown
# ADR: <Decision title>

- Status:
- Date:
- Owners:

## Context
## Decision
## Alternatives considered
## Consequences
## Follow-up actions
```

## Runbook
```markdown
# <Service> Runbook

## Purpose
## Preconditions / access
## Signals and symptoms
## Immediate checks
## Standard operating procedure
## Escalation path
## Rollback / recovery
## References
```

## Migration guide
```markdown
# <Migration> Guide

## Scope
## Preconditions
## Compatibility / breaking changes
## Step-by-step migration
## Validation
## Rollback
## Communication notes
```

## Internal developer guide
```markdown
# <Topic> Developer Guide

## What this system does
## When to use / not use it
## Key concepts
## Local development or operational workflow
## Common pitfalls
## Troubleshooting / escalation
## Related docs
```
