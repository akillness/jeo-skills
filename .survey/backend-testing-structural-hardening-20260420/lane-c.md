# Lane C: Actual behavior

## What People Actually Use
- A layered mix of unit/service tests, selected integration tests, and a few smoke paths remains the normal backend-testing shape.
- Real containers or real databases get pulled in when repository, migration, or serialization behavior matters; teams do not fully trust in-memory substitutes for those risks ([Testcontainers guide](https://testcontainers.com/guides/getting-started-with-testcontainers-for-java/)).
- Contract testing is valuable but usually appears only when teams already know the pattern or a compatibility failure made it unavoidable ([Pact docs](https://docs.pact.io/)).
- CI docs and tools show matrix/build-test execution clearly, but real projects still need explicit human choices about what runs locally, on PRs, and on slower scheduled lanes ([GitHub Actions Python testing](https://docs.github.com/en/actions/use-cases-and-examples/building-and-testing/building-and-testing-python)).

## Common Workarounds
1. Describe the change loosely, then improvise layers from memory.
2. Add a containerized DB only after fake/in-memory coverage misses behavior.
3. Treat flaky-test stabilization as a debugging note instead of a first-class packet.
4. Default to larger integration breadth when contract/API intent was not named early.

## Pain Points With Current Solutions
- Requests still arrive as generic “add backend tests,” which hides whether the real task is coverage planning, contract protection, or flake control.
- Realistic dependencies improve trust but can make PR loops too heavy if the suite split is not explicit.
- CI-vs-local drift remains a frequent practical complaint in indexed discussion results (`DuckDuckGo HTML indexed snippet`, medium confidence).
- Contract-testing tools are strong, but they are still less default than unit/integration language in everyday team requests.

## Sources
- https://testcontainers.com/guides/getting-started-with-testcontainers-for-java/
- https://docs.pact.io/
- https://docs.github.com/en/actions/use-cases-and-examples/building-and-testing/building-and-testing-python
- https://martinfowler.com/articles/practical-test-pyramid.html
- DuckDuckGo HTML indexed snippets for the three backend/flaky-test queries used in this survey
