<script lang="ts">
  import { shortcuts, useShortcut } from "@ui-sdk/svelte/shortcuts"

  let text = $state("")
  let status = $state("Focus the note to turn on its shortcuts.")

  useShortcut(
    "mod+enter",
    () => (status = `Characters saved: ${text.trim().length}`),
    {
      scope: "note",
      when: () => text.trim() !== "",
      description: "Save the note",
    }
  )
  useShortcut(
    "escape",
    () => {
      text = ""
      status = "Cleared"
    },
    { scope: "note", allowInInput: true, description: "Clear the note" }
  )
</script>

<div data-slot="stack">
  <textarea
    bind:value={text}
    aria-label="Note"
    placeholder="Write a note…"
    onfocus={() => shortcuts.setScope("note", true)}
    onblur={() => shortcuts.setScope("note", false)}></textarea>
  <output data-slot="output">{status}</output>
</div>
