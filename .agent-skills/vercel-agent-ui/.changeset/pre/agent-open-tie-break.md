---
"@ui-sdk/core": patch
---

An `act` step that names a component by its label no longer lands on an open component whose label only holds the same words, like an open Collapsible "Read live-system.png" for a step naming the Button "System". The step is refused with both refs, as it is while nothing is open.
