---
"@ui-sdk/core": patch
"@ui-sdk/react": patch
"@ui-sdk/vue": patch
"@ui-sdk/svelte": patch
"@ui-sdk/solid": patch
"@ui-sdk/web": patch
---

Segmented Control's indicator gets `data-activation-direction`, like Tabs' indicator: `"none"` on its first placement, so a transition can skip it, then which way the checked item moved.
