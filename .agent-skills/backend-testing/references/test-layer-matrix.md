# Backend Test Layer Matrix

Use this matrix to keep `backend-testing` scoped and practical.

## Layer selection

| Layer | Use when | Avoid when | Typical tools / patterns |
|------|----------|------------|--------------------------|
| Unit / service | branching logic, validation, orchestration, pure-ish business rules | the risk depends on framework wiring or real persistence behavior | pytest/Jest/JUnit, framework-native mocks, small factories |
| Integration | DB queries, migrations, repositories, middleware wiring, queue/cache behavior | the dependency is irrelevant to the risk and only slows feedback | Testcontainers, framework test clients, transactional reset |
| Contract / API | response shapes, status codes, schemas, backward compatibility, shared interfaces | the interface is still being designed or changing too quickly to freeze honestly | Supertest, REST Assured, Playwright API, Schemathesis, Pact |
| Smoke / selective E2E | a narrow release-critical journey crosses several backend boundaries | the team is trying to replace every lower layer with expensive full-stack coverage | auth bootstrap helpers, seeded envs, minimal critical journeys |

## Dependency realism guide

| Dependency | Default bias | Why |
|------------|--------------|-----|
| Database / cache / queue | Prefer real containerized dependency when behavior matters | Query semantics, migrations, transaction behavior, serialization, and race conditions drift quickly from fake setups |
| Third-party HTTP API | Prefer mock/stub unless the integration contract itself is under review | External instability and cost can drown the signal |
| Auth provider | Prefer helpers/fakes for most cases; use deeper integration only for security-critical flows | Auth setup cost expands fast and can dominate the whole suite |
| Filesystem / object storage | Use the lightest thing that still exposes relevant behavior | Many changes only need a seam, not a full environment |

## Review questions
- What backend behavior would hurt most if it broke tomorrow?
- Which lower layer could catch that cheaper than a full smoke test?
- What setup can be shared safely, and what state must be reset per test?
- Which dependencies need realism, and which only need predictable behavior?
- Is the team optimizing for local iteration, CI confidence, or release proof?
