<script lang="ts">
  import { BoldIcon, ItalicIcon, LinkIcon } from "@lucide/svelte"
  import { useShortcut } from "@ui-sdk/svelte/shortcuts"
  import {
    createToolbarController,
    Toolbar,
    ToolbarButton,
  } from "@ui-sdk/svelte/toolbar"
  import { useLog } from "../../../shared/svelte/log"

  const actions = [
    { label: "Bold", icon: BoldIcon },
    { label: "Italic", icon: ItalicIcon },
    { label: "Insert link", icon: LinkIcon },
  ]

  const log = useLog()
  const toolbar = createToolbarController()
  useShortcut("alt+f10", () => toolbar.focus(), { allowInInput: true })
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => toolbar.focus()}>Focus Toolbar</button>
  </div>
  <Toolbar controller={toolbar} aria-label="Notes formatting">
    {#each actions as { label, icon: Icon } (label)}
      <ToolbarButton aria-label={label} onclick={() => log(label)}>
        <Icon aria-hidden="true" />
      </ToolbarButton>
    {/each}
  </Toolbar>
  <textarea aria-label="Notes" placeholder="Type, then press Alt+F10"
  ></textarea>
</div>
