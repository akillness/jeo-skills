---
"@ui-sdk/core": patch
---

A composed Command group renders shown on the server while there's no query, instead of `hidden` until its items bind, so the list doesn't jump on hydration. This also covers Trigger Menu groups.
