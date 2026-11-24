<script setup lang="ts">
import { shortcuts, useShortcut } from "@ui-sdk/vue/shortcuts"
import { ref } from "vue"

const text = ref("")
const status = ref("Focus the note to turn on its shortcuts.")

useShortcut(
  "mod+enter",
  () => (status.value = `Characters saved: ${text.value.trim().length}`),
  {
    scope: "note",
    when: () => text.value.trim() !== "",
    description: "Save the note",
  }
)
useShortcut(
  "escape",
  () => {
    text.value = ""
    status.value = "Cleared"
  },
  { scope: "note", allowInInput: true, description: "Clear the note" }
)
</script>

<template>
  <div data-slot="stack">
    <textarea
      v-model="text"
      aria-label="Note"
      placeholder="Write a note…"
      @focus="shortcuts.setScope('note', true)"
      @blur="shortcuts.setScope('note', false)"
    />
    <output data-slot="output">{{ status }}</output>
  </div>
</template>
