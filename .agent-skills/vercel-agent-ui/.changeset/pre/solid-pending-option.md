---
"@ui-sdk/solid": patch
---

A Solid root whose controlled option is still loading, like `<Switch checked={checked()}>` over an async memo, now waits under your `<Loading>` and renders once the value arrives. Before, the component that rendered the root was made again each time, so its source never finished loading.
