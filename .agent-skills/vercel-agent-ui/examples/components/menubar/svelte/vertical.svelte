<script lang="ts">
  import { Menu, MenuContent, MenuItem, MenuTrigger } from "@ui-sdk/svelte/menu"
  import { Menubar } from "@ui-sdk/svelte/menubar"
</script>

<Menubar orientation="vertical">
  {#each ["Inbox", "Drafts", "Archive"] as label (label)}
    <Menu>
      <MenuTrigger>{label}</MenuTrigger>
      <MenuContent>
        <MenuItem>Open {label}</MenuItem>
        <MenuItem>Mark all as read</MenuItem>
      </MenuContent>
    </Menu>
  {/each}
</Menubar>
