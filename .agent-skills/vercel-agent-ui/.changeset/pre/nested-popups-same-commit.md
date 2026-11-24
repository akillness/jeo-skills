---
"@ui-sdk/core": patch
---

A nested dialog or popup shown in the same commit as the one around it, like two nested dialogs mounted open or shown again by `<Activity>`, now opens above it and nests under it, so one Escape closes only the nested one.
