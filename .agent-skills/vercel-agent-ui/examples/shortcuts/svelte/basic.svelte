<script lang="ts">
  import { useShortcut, useShortcutHint } from "@ui-sdk/svelte/shortcuts"

  let status = $state("Press N or the keys to save.")
  const newNote = () => (status = "Note created")
  const save = () => (status = "Saved")

  useShortcut("n", newNote, { description: "New note" })
  useShortcut("mod+s", save, { description: "Save" })
  const saveHint = useShortcutHint("mod+s")
</script>

<div data-slot="stack">
  <div data-slot="row">
    <button type="button" aria-keyshortcuts="N" onclick={newNote}>
      New note
      <kbd aria-hidden="true" data-slot="kbd">N</kbd>
    </button>
    <button
      type="button"
      aria-keyshortcuts={saveHint.ariaKeyshortcuts}
      onclick={save}
    >
      Save
      <kbd aria-hidden="true" data-slot="kbd">{saveHint.text}</kbd>
    </button>
  </div>
  <output data-slot="output">{status}</output>
</div>
