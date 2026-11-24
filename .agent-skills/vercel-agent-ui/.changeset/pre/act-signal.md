---
"@ui-sdk/core": patch
---

`agent.act` takes an optional `{ signal }`. When it aborts, a step waiting on `allow` fails as cancelled and later steps don't run, so a chat's stop button can end a confirm nobody will answer.
