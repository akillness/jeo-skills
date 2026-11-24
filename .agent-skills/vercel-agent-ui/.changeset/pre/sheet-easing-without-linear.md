---
"@ui-sdk/core": patch
---

A sheet no longer throws as it settles in a browser without `linear()` easing, like Safari before 17.2. It plays the same spring as a keyframe per frame there.
