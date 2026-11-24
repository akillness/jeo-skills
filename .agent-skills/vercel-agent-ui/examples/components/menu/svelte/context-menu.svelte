<script lang="ts">
  import {
    Menu,
    MenuContent,
    MenuContextTrigger,
    MenuItem,
    MenuSeparator,
  } from "@ui-sdk/svelte/menu"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<Menu onAction={(value) => log(`Chose ${value}`)}>
  <MenuContextTrigger tabindex={0}
    >Right-click or long-press here</MenuContextTrigger
  >
  <MenuContent>
    <MenuItem value="back">Back</MenuItem>
    <MenuItem value="forward" disabled>Forward</MenuItem>
    <MenuItem value="reload">Reload</MenuItem>
    <MenuSeparator />
    <MenuItem value="save">Save page as…</MenuItem>
    <MenuItem value="print">Print…</MenuItem>
  </MenuContent>
</Menu>
