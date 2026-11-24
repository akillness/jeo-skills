---
"@ui-sdk/vue": patch
---

A Vue `Input` or `Textarea` whose `value` or `v-model` the parent doesn't update now keeps showing that value as you type, like in React. Before, the typed text stayed and the form submitted it. `v-model.trim` and `v-model.number` still keep the text being typed.
