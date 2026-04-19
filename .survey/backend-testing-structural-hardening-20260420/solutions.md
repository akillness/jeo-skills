# Solution Landscape: backend-testing structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| backend-testing | Repo-local skill for backend coverage design, fixture strategy, dependency realism, and CI-vs-local execution | Already owns the right repo boundary; support files and evals exist; can route to adjacent skills | Front door is still long enough to blur packet selection and route-outs | Best bounded fix is structural hardening, not a new wrapper |
| Testcontainers | Containerized real dependencies for tests | Strong answer when DB / queue / wire behavior matters | Can slow PR paths and tempt teams into overusing heavy suites | Good “real dependency” lane, not the whole testing strategy |
| Pact | Contract testing between services and APIs | Distinct layer between unit and full integration; catches interface drift | Often underused unless users already know to ask for it | Good reason to keep contract/API packet language explicit |
| pytest good practices | Test layout, packaging, and fixture guidance | Practical repo/test-layout grounding | Python-specific and not a full backend-testing workflow | Good evidence for fixture/layout discipline |
| GitHub Actions test workflows | CI matrix and build/test automation | Makes PR-vs-CI-vs-matrix execution explicit | Does not choose the right test layers for you | Relevant for execution-plan packet, not packet selection itself |
| testing-strategies | Broader validation-policy router | Owns org-wide testing policy and gate design | Not meant for backend implementation packets | Primary route-out when requests become policy-heavy |
| authentication-setup / api-design | Adjacent backend skills | Keep auth implementation and API contract shape separate | Not testing skills | Important route-outs to preserve |

## Categories
- **Backend coverage packet selection:** `backend-testing`
- **Real dependency / integration realism:** Testcontainers
- **Contract/API compatibility:** Pact
- **Framework/test-layout guidance:** pytest good practices
- **CI execution surfaces:** GitHub Actions testing docs
- **Adjacent repo routers:** `testing-strategies`, `authentication-setup`, `api-design`

## What People Actually Use
In practice, teams mix a few backend layers manually: lower-level unit/service coverage, selected integration tests with a real DB or container when fidelity matters, and a narrow CI path with only a few higher-cost checks. Contract testing is valuable but still feels like a specialist move instead of the default language of “add tests.” Flaky-suite requests usually arrive only after CI trust has already degraded.

## Frequency Ranking
1. **Layered unit + integration + selective smoke**
2. **Containerized real dependencies when persistence/wiring matters**
3. **CI matrix/build-test execution guidance**
4. **Contract testing as a targeted interface-protection layer**
5. **Broad test-policy frameworks**

## Key Gaps
- The market has strong tools for layers inside backend testing, but fewer good front doors that classify the *request packet* first.
- Contract/API coverage remains under-triggered unless the prompt explicitly mentions contracts or schemas.
- Flake/stability work is often treated as a debugging appendix instead of a first-class backend-testing packet.
- Adjacent-skill boundaries are easy to blur when test planning, API design, and auth implementation show up in the same request.

## Contradictions
- Teams know they should avoid giant E2E suites, but real-dependency and CI-fidelity needs still pull work upward unless the packet is scoped tightly.
- Contract testing is sold as a faster alternative to broad integration environments, yet many practical requests still skip it and default to wider integration coverage.
- CI docs make execution-lane splits obvious, but many “add tests” conversations still do not state local-fast vs PR vs scheduled lanes explicitly.

## Key Insight
`backend-testing` does not need more testing theory. It needs a tighter front door that asks one question first: **what packet is this — coverage plan, fixture/data reshaping, contract/API protection, or flake stabilization?** Once that packet is explicit, the rest of the skill can stay honest about dependency realism, local-vs-CI splits, and route-outs to `testing-strategies`, `api-design`, and `authentication-setup`.

## Curated Sources
- Testcontainers getting started: https://testcontainers.com/guides/getting-started-with-testcontainers-for-java/
- Pact docs: https://docs.pact.io/
- pytest good practices: https://docs.pytest.org/en/stable/explanation/goodpractices.html
- GitHub Actions Python testing: https://docs.github.com/en/actions/use-cases-and-examples/building-and-testing/building-and-testing-python
- The Practical Test Pyramid: https://martinfowler.com/articles/practical-test-pyramid.html
- DuckDuckGo HTML indexed snippets for backend/flaky-test queries (`backend testing flaky ci testcontainers reddit`, `contract testing pact integration testing reddit`, `backend tests local vs ci flaky integration tests discussion`)
