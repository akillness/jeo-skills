<script lang="ts">
  import { ChevronDownIcon } from "@lucide/svelte"
  import { Menu, MenuContent, MenuItem, MenuTrigger } from "@ui-sdk/svelte/menu"
  import { Toolbar, ToolbarButton } from "@ui-sdk/svelte/toolbar"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<Toolbar aria-label="Document">
  <ToolbarButton onclick={() => log("Saved")}>Save</ToolbarButton>
  <Menu onAction={(value) => log(`Shared by ${value}`)}>
    <ToolbarButton>
      {#snippet render({ props })}
        <MenuTrigger {...props}>
          Share
          <ChevronDownIcon aria-hidden="true" />
        </MenuTrigger>
      {/snippet}
    </ToolbarButton>
    <MenuContent>
      <MenuItem value="email">Email</MenuItem>
      <MenuItem value="link">Copy Link</MenuItem>
    </MenuContent>
  </Menu>
  <ToolbarButton onclick={() => log("Printed")}>Print</ToolbarButton>
</Toolbar>
