# Triage
- Problem: `authentication-setup` is still an oversized front-door skill (337 lines) even after modernization; the lane boundaries are correct, but too much provider/lane/session detail still lives in `SKILL.md` instead of focused support packets.
- Audience: agents and maintainers using or evolving the backend/fullstack auth setup skill for web apps, APIs, SaaS products, and enterprise add-on work.
- Why now: graphify shows support coverage is already complete across the repo, so the next leverage comes from dense-anchor cleanup. `authentication-setup` remains one of the largest backend/frontstack front doors on the watchlist and is a high-frequency route target.
