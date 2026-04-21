# Context: API documentation modernization

## Workflow Context
This run scanned high-value legacy-anchor opportunities across CLI/developer workflow, web development, product/UX/operations, marketing/content, and game-development-adjacent release flows. The strongest bounded documentation-cluster target is `api-documentation`.

Why this skill rose to the top:
1. The repo already modernized `technical-writing` for internal docs and `user-guide-writing` for customer-facing docs, but `api-documentation` is still a legacy example dump.
2. API docs are a stable cross-team workflow: contract handoff, auth setup notes, examples, error semantics, SDK guidance, portal publishing, and drift prevention.
3. The job appears in backend/product/platform work and also supports frontend, partner, content, and launch workflows because API docs are a shared external-facing developer surface.
4. The current market/tooling landscape is crowded, which makes route-outs and workflow boundaries more valuable than another vendor-specific wrapper.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Backend engineer | Publish or update REST/GraphQL/Webhook reference docs and examples | Intermediate–advanced |
| Platform / developer experience engineer | Keep OpenAPI/spec, examples, portal publishing, and SDK docs aligned | Intermediate–advanced |
| Product / partner engineer | Explain integration flows, auth setup, errors, versioning, and migration notes for developers | Intermediate |
| Technical writer / docs engineer | Turn contracts and implementation details into usable developer-facing docs | Intermediate |
| Frontend / full-stack engineer | Consume API docs and surface gaps in examples, auth notes, and error handling | Intermediate |

## Current Workarounds
1. Teams generate OpenAPI/Swagger output, then patch in hand-written examples because generated docs alone are not enough.
2. Working request/response payloads get copied from tests, Postman collections, curl snippets, or logs rather than maintained as a coherent example strategy.
3. Auth setup, rate limits, pagination, webhook verification, and error-recovery guidance often live in separate README or support notes instead of the main API docs.
4. Release notes and changelog entries carry API behavior changes because the developer portal/reference docs lag behind the actual contract.
5. Spec-first and code-first workflows both drift unless the team owns a clear source-of-truth and verification loop.

## Adjacent Problems
- `api-design` owns contract shape, compatibility, and interface decisions before implementation.
- `authentication-setup` owns provider/session/token setup details when auth implementation is the main job.
- `technical-writing` owns internal specs, ADRs, runbooks, and migration notes.
- `user-guide-writing` owns end-user tutorials and help-center content.
- `changelog-maintenance` owns release-note hygiene and semver communication.
- `backend-testing` owns contract/integration coverage, not portal prose.

## User Voices
- OpenAPI and Swagger are widely used because teams need a machine-readable contract, but practical guides keep emphasizing examples, auth notes, and human curation beyond the generated schema. Sources: https://www.openapis.org/ , https://swagger.io/tools/swagger-ui/
- Developer-portal platforms such as Redocly, Mintlify, and Docusaurus API docs exist because publishing/reference rendering is a distinct workflow, not just a raw spec dump. Sources: https://redocly.com/redoc/ , https://mintlify.com/ , https://docusaurus.io/docs/api-docs/introduction
- Repeated practitioner advice focuses on drift prevention, usable examples, auth/error documentation, and portal ownership instead of “generate once and forget.” Sources: https://www.speakeasy.com/blog/api-documentation-best-practices , https://www.stainless.com/sdk-api-best-practices/practical-guide-to-openapi-refs-examples-and-common-errors
