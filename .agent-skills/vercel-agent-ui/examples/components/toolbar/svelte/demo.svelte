<script lang="ts">
  import { BoldIcon, ItalicIcon, LinkIcon, UnderlineIcon } from "@lucide/svelte"
  import { Toggle, ToggleIcon } from "@ui-sdk/svelte/toggle"
  import {
    Toolbar,
    ToolbarButton,
    ToolbarSeparator,
  } from "@ui-sdk/svelte/toolbar"
  import { useLog } from "../../../shared/svelte/log"

  const styles = [
    { label: "Bold", icon: BoldIcon },
    { label: "Italic", icon: ItalicIcon },
    { label: "Underline", icon: UnderlineIcon },
  ]

  const log = useLog()
</script>

<Toolbar aria-label="Formatting">
  {#each styles as { label, icon: Icon } (label)}
    <Toggle
      aria-label={label}
      onPressedChange={(pressed) => log(`${label} ${pressed ? "on" : "off"}`)}
    >
      <ToggleIcon>
        <Icon />
      </ToggleIcon>
    </Toggle>
  {/each}
  <ToolbarSeparator />
  <ToolbarButton aria-label="Insert link" onclick={() => log("Insert link")}>
    <LinkIcon aria-hidden="true" />
  </ToolbarButton>
</Toolbar>
