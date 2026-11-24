<script lang="ts">
  import { ChevronRightIcon } from "@lucide/svelte"
  import {
    Menu,
    MenuContent,
    MenuItem,
    MenuSeparator,
    MenuSub,
    MenuSubContent,
    MenuSubTrigger,
    MenuTrigger,
  } from "@ui-sdk/svelte/menu"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<Menu
  onOpenChange={(open) => log(open ? "Opening" : "Closing")}
  onOpenChangeComplete={(open) =>
    log(open ? "Finished opening" : "Finished closing")}
>
  <MenuTrigger>Animated</MenuTrigger>
  <MenuContent keepMounted>
    <MenuItem>Back</MenuItem>
    <MenuItem>Forward</MenuItem>
    <MenuItem>Reload</MenuItem>
    <MenuSeparator />
    <MenuSub>
      <MenuSubTrigger>
        More tools
        <ChevronRightIcon aria-hidden="true" />
      </MenuSubTrigger>
      <MenuSubContent>
        <MenuItem>Save page as…</MenuItem>
        <MenuItem>Developer tools</MenuItem>
      </MenuSubContent>
    </MenuSub>
  </MenuContent>
</Menu>
