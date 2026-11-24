---
"@ui-sdk/core": patch
---

`formatFileSize` now writes sizes under 1 kB with the unit in full, like "70 bytes", where it read "70 byte".
