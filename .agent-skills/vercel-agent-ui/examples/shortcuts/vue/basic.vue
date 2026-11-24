<script setup lang="ts">
import { useShortcut, useShortcutHint } from "@ui-sdk/vue/shortcuts"
import { ref } from "vue"

const status = ref("Press N or the keys to save.")
const newNote = () => (status.value = "Note created")
const save = () => (status.value = "Saved")

useShortcut("n", newNote, { description: "New note" })
useShortcut("mod+s", save, { description: "Save" })
const { text: saveKeys, ariaKeyshortcuts: saveAria } = useShortcutHint("mod+s")
</script>

<template>
  <div data-slot="stack">
    <div data-slot="row">
      <button type="button" aria-keyshortcuts="N" @click="newNote">
        New note
        <kbd aria-hidden="true" data-slot="kbd">N</kbd>
      </button>
      <button type="button" :aria-keyshortcuts="saveAria" @click="save">
        Save
        <kbd aria-hidden="true" data-slot="kbd">{{ saveKeys }}</kbd>
      </button>
    </div>
    <output data-slot="output">{{ status }}</output>
  </div>
</template>
