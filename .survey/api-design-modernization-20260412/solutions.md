# Solution Landscape: api-design modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Postman API Design | All-in-one design + collections + mocks + testing | Familiar, collaborative, easy for teams already using Postman | Collections/testing often overshadow durable contract governance | Better as a workflow input than a repo skill boundary |
| SwaggerHub | OpenAPI-centric hosted design workflow | Strong spec authoring and sharing | Enterprise/paywall tilt; strongly OpenAPI-only | Useful reference for contract-first REST flows |
| Stoplight + Spectral | Design-first OpenAPI + lint/governance | Good style-rule and governance framing | Fragmented product surface; less central for GraphQL | Strong inspiration for review/lint sections |
| Redocly | Git-native OpenAPI governance and docs | Strong linting, bundling, and docs handoff | More governance/docs than collaborative design UX | Good model for handoff to `api-documentation` |
| Apollo GraphOS | GraphQL registry and change management | Strong schema checks and governance | Heavyweight if the need is basic schema design only | Good reference for contract review and breaking changes |
| GraphQL Hive | GraphQL schema registry and checks | Lightweight GraphQL governance option | Still needs separate authoring conventions | Useful GraphQL governance reference |
| Insomnia / Bruno / Hoppscotch | API client plus partial design support | Common developer workflow tools | Rarely become the durable source of truth | Evidence that people still mix tools |

## Categories
- REST design suites: Postman, SwaggerHub, Stoplight, Apidog
- Git-native OpenAPI governance/docs: Redocly, Spectral
- GraphQL contract governance: Apollo GraphOS, GraphQL Hive
- API clients with partial design support: Insomnia, Bruno, Hoppscotch

## What People Actually Use
Teams still fall back to repo-managed OpenAPI files, Postman collections, code annotations, ADRs, and spreadsheets even when they buy a design platform. The pattern is stable: one tool rarely owns design, examples, governance, testing, and publishing cleanly enough.

## Frequency Ranking
1. Postman ecosystem
2. Swagger / SwaggerHub ecosystem
3. Stoplight + Spectral
4. Redocly
5. Apollo GraphOS
6. GraphQL Hive
7. Insomnia / Bruno / Hoppscotch

## Key Gaps
- Existing repo skills do not cleanly separate contract-first API design from downstream documentation/publishing.
- `api-design` lacks references and evals despite being a high-utility backend anchor.
- The skill should explain how to choose the contract artifact and how to review breaking changes, not just dump REST/OpenAPI examples.

## Contradictions
- Marketed claim: all-in-one API platforms can cover design, docs, testing, and collaboration in one place.
- User reality: teams still keep rationale in ADRs/docs, contract files in git, examples in collections, and final docs in another surface.

## Key Insight
The highest-value bounded improvement is not a new backend skill. It is modernizing `api-design` into a contract-first workflow skill that owns boundary decisions, review, and handoff, while `api-documentation` owns reference rendering, examples, and publishing.

## Curated Sources
- https://www.postman.com/api-platform/api-design/
- https://swagger.io/tools/swaggerhub/
- https://swagger.io/specification/
- https://smartbear.com/stoplight/studio/
- https://github.com/stoplightio/spectral
- https://redocly.com/
- https://www.apollographql.com/docs/graphos/
- https://the-guild.dev/graphql/hive
- https://insomnia.rest/products/design
- https://hoppscotch.io/
- https://www.usebruno.com/
