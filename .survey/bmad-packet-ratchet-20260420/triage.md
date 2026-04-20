# Triage
- Problem: `bmad` is still a large front-door router and likely needs a tighter packet-first contract so it chooses one phase packet and routes runtime/game/planning detail outward earlier.
- Audience: agents and users working on structured BMAD/BMM workflows across developer tooling, product planning, web/fullstack delivery, and game production.
- Why now: graphify still flags `bmad` as a high-degree oversized router, the repo already has neighboring specialists (`bmad-idea`, `bmad-gds`, `task-planning`, `plannotator`, `omc`, `omx`, `ohmg`), and the next hourly maintenance win should prefer a bounded ratchet over another overlapping wrapper.
