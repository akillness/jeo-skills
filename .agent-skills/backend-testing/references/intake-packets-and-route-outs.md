# Intake Packets and Route-outs

Use this reference when `backend-testing` needs a fast packet choice before going deeper.

## Primary packets

| Packet | Use when | Typical output | Watch-outs |
|---|---|---|---|
| `coverage-plan` | A concrete backend change needs the right layer mix | Coverage table + dependency strategy + exclusions | Do not bloat into broad QA policy |
| `fixture-and-reset-plan` | Setup, seeding, rollback, auth bootstrap, or isolation are the main pain | Fixture/reset memo | Hidden shared state is usually the real problem |
| `contract-and-api-checks` | The API/event shape already exists and the risk is compatibility drift | Contract/API protection packet | Route API redesign/versioning debates to `api-design` |
| `flake-stabilization` | CI-only or intermittent backend failures are eroding trust | Flake memo with likely causes, isolation fixes, readiness checks, and debug signals | Retries are not a substitute for diagnosis |
| `execution-lane-split` | The suite exists, but local/PR/scheduled/release responsibilities are muddled | Lane matrix | Keep expensive realism out of the fast path unless essential |

## Fast route-outs

- **`testing-strategies`** — use when the user really wants org-wide test policy, evidence gates, release confidence policy, or cross-stack QA strategy.
- **`api-design`** — use when the real debate is contract shape, versioning, error semantics, schema redesign, or interface ownership before tests can be scoped honestly.
- **`authentication-setup`** — use when session/JWT/provider/RBAC implementation choices are still unsettled and the test plan depends on those design decisions.
- **`debugging`** — use when the main need is reproducing and isolating a live defect rather than designing backend regression coverage.

## Dependency realism cues

- Prefer **containerized real dependencies** when repository logic, migrations, query semantics, serialization, or queue behavior are the risk.
- Prefer **mock/stub** for outbound vendors when the integration contract itself is not under review.
- Prefer **fake/simulator** when you need behavior but not full production parity.
- Call **shared external environments** fragile when they are unavoidable.

## Lane-split cues

- **Local-fast**: high-frequency confidence, narrow surface, cheap setup.
- **PR CI**: merge-gating checks with bounded realism.
- **Scheduled/nightly**: heavier breadth, matrix expansion, or slower containers.
- **Release/incident**: narrow confidence checks or regression ratchets tied to a specific risk.
