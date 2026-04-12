# Context: api-design modernization

## Workflow Context
API design shows up before implementation, testing, and published docs. In repo-local workflow examples, API specs are treated as contract-setting artifacts that other roles consume later, not as the end of the job.

- `opencontext` explicitly starts an API flow with “Design API spec using the skill” before implementation and testing.
- `clawteam` examples block backend work on “Design API contracts and OpenAPI spec”.
- `bmad` phase guidance expects architecture docs to reference an OpenAPI/schema artifact from an earlier phase.

That makes the most valuable boundary for `api-design`:
- contract shape and resource modeling
- operation semantics and versioning
- auth/error/pagination/idempotency rules
- compatibility and breaking-change review
- review/handoff into implementation, testing, and docs

`api-documentation` is better positioned for:
- rendered reference docs
- interactive docs portals
- examples/tutorials/SDK-facing docs
- changelogs and publishing flows

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Backend / API engineer | Define resources, endpoints, schemas, status codes, auth model, and contract boundaries | Intermediate–advanced |
| Frontend / client engineer | Depend on stable request/response contracts and change visibility | Intermediate |
| Tech lead / architect | Approve compatibility, versioning, naming, and service-boundary decisions | Advanced |
| QA / integration engineer | Build contract/integration tests from stable API behaviors | Intermediate |
| Tech writer / DevRel | Turn stable contracts into docs, examples, and developer onboarding surfaces | Intermediate |

## Current Workarounds
1. Use OpenAPI as both the design artifact and the documentation artifact, even though that blurs boundaries between contract design and doc publishing.
2. Split the work informally by role: architect or backend lead designs the contract, then frontend/QA/docs teams consume it downstream.
3. Store rationale outside the spec in ADRs, tickets, or engineering notes because OpenAPI captures shape better than decision context.
4. Rely on adjacent skills such as `authentication-setup`, `backend-testing`, and `database-schema-design` to cover missing detail after the broad `api-design` pass.

## Adjacent Problems
- API governance and style-guide enforcement
- Breaking-change review and compatibility policy
- Contract testing and mock/example drift
- Schema / data-model coupling
- Auth/security boundary decisions that should be defined but not fully implemented in this skill

## User Voices
> “Design API contracts and OpenAPI spec”  
Source: `.agent-skills/clawteam/references/use-cases.md`

> “Design API spec using the skill”  
Source: `.agent-skills/opencontext/SKILL.md`

> “Architecture document must reference OpenAPI/Schema spec from Phase 2”  
Source: `.agent-skills/bmad/resources/workflow-phases.md`

## Sources
- Repo: `.agent-skills/api-design/SKILL.md`
- Repo: `.agent-skills/api-documentation/SKILL.md`
- Repo: `.agent-skills/opencontext/SKILL.md`
- Repo: `.agent-skills/clawteam/references/use-cases.md`
- Repo: `.agent-skills/bmad/resources/workflow-phases.md`
