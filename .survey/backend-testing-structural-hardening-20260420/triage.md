# Triage
- Problem: Tighten `backend-testing` into a routing-first backend test packet selector that clearly separates coverage design, fixture/data control, flaky-suite stabilization, contract/API checks, and route-outs to adjacent skills.
- Audience: Agent operators and repo maintainers working on APIs, services, workers, auth flows, or backend integration boundaries who need practical test guidance without drifting into org-wide test policy.
- Why now: `backend-testing` is still one of the repo’s larger front-door skills without a structural-hardening pass, while adjacent skills (`testing-strategies`, `authentication-setup`, `api-design`) have already been tightened into packet-first routers. The next gain is sharper trigger precision and clearer handoffs, not another testing wrapper.
