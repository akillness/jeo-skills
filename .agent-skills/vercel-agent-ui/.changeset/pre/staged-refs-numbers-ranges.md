---
"@ui-sdk/core": patch
---

`stageChanges` finds a control by its ref on a page longer than an agent snapshot, where it used to skip the change. `parseNumber` and `isPartialNumber` refuse a group separator after the decimal one, like "1,234.98,7654". A Date Input or Time Input outside `min` or `max` matches a Field Error's `rangeUnderflow` or `rangeOverflow` in every framework, as it already did in web components.
