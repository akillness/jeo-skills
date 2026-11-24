<script lang="ts">
  import {
    Menu,
    MenuContent,
    MenuGroup,
    MenuGroupLabel,
    MenuItem,
    MenuSeparator,
    MenuTrigger,
  } from "@ui-sdk/svelte/menu"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<Menu onAction={(value) => log(`Chose ${value}`)}>
  <MenuTrigger>Open Menu</MenuTrigger>
  <MenuContent>
    <MenuGroup>
      <MenuGroupLabel>Project</MenuGroupLabel>
      <MenuItem value="overview">Overview</MenuItem>
      <MenuItem value="members">Members</MenuItem>
      <MenuItem value="settings">Settings</MenuItem>
    </MenuGroup>
    <MenuSeparator />
    <MenuGroup>
      <MenuGroupLabel>Help</MenuGroupLabel>
      <MenuItem value="docs">Documentation</MenuItem>
      <MenuItem value="feedback">Send feedback</MenuItem>
    </MenuGroup>
  </MenuContent>
</Menu>
