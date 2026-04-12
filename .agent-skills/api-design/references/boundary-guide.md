# API Design Boundary Guide

## What `api-design` owns
Use `api-design` for the contract-first decisions that happen before implementation and before docs publishing:
- API style choice: REST vs GraphQL vs a deliberate mixed surface
- resource/type boundaries
- endpoint or schema shape
- request/response semantics
- auth/error/versioning expectations at the contract layer
- backward-compatibility and breaking-change review
- OpenAPI / SDL / design-packet output for downstream teams

## What `api-design` does not own
### Route to `api-documentation` when the user needs
- reference docs sites or portals
- tutorials, onboarding guides, and examples
- Swagger UI / Redoc / doc publishing setup
- SDK-facing docs or changelog presentation

### Route to `authentication-setup` when the user needs
- JWT/OAuth/session implementation details
- provider setup and token flows
- middleware, guards, callbacks, or auth libraries

### Route to `backend-testing` when the user needs
- contract tests
- integration test plans
- API regression coverage
- mock/test harness strategy

### Route to `database-schema-design` when the user needs
- table/index design
- normalization / denormalization choices
- query-path performance modeling
- storage-engine tradeoffs

## Typical handoff order
1. `api-design` — define contract and compatibility rules
2. `authentication-setup` / `database-schema-design` — implement core backend concerns
3. `backend-testing` — define verification for the contract
4. `api-documentation` — publish docs, examples, and developer guidance

## Common failure modes
- Treating OpenAPI generation as the whole job
- Mixing tutorial-writing into contract design
- Hiding breaking changes behind vague “v2 later” language
- Designing endpoints without naming/auth/error conventions
- Using this skill to write server code instead of a contract packet
