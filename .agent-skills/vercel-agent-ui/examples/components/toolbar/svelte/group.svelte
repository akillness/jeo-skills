<script lang="ts">
  import {
    ClipboardIcon,
    CopyIcon,
    RedoIcon,
    ScissorsIcon,
    UndoIcon,
  } from "@lucide/svelte"
  import {
    Toolbar,
    ToolbarButton,
    ToolbarGroup,
    ToolbarSeparator,
  } from "@ui-sdk/svelte/toolbar"
  import { useLog } from "../../../shared/svelte/log"

  const clipboard = [
    { label: "Cut", icon: ScissorsIcon },
    { label: "Copy", icon: CopyIcon },
    { label: "Paste", icon: ClipboardIcon },
  ]

  const log = useLog()
</script>

<Toolbar aria-label="Edit">
  <ToolbarGroup aria-label="Clipboard">
    {#each clipboard as { label, icon: Icon } (label)}
      <ToolbarButton aria-label={label} onclick={() => log(label)}>
        <Icon aria-hidden="true" />
      </ToolbarButton>
    {/each}
  </ToolbarGroup>
  <ToolbarSeparator />
  <ToolbarGroup disabled aria-label="History">
    <ToolbarButton aria-label="Undo">
      <UndoIcon aria-hidden="true" />
    </ToolbarButton>
    <ToolbarButton aria-label="Redo">
      <RedoIcon aria-hidden="true" />
    </ToolbarButton>
  </ToolbarGroup>
</Toolbar>
