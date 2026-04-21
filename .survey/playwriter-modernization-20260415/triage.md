# Triage
- Problem: `playwriter` is high-utility but still reads like a flat command/integration guide; it underplays scenario selection, authenticated-state tradeoffs, and some upstream workflow details such as `playwriter browser start` and explicit attach-vs-fresh-browser boundaries.
- Audience: agent builders, developers, QA/ops users, and browser-automation users who need authenticated/stateful browser control from a running Chrome session.
- Why now: the repo already has strong headless-browser guidance (`agent-browser`) and several modernized decision-first skills, so `playwriter` is now a visible weak point in the web/dev-workflow lane. Upstream messaging has also sharpened the “use your running browser” story, which the local skill only partially reflects.
