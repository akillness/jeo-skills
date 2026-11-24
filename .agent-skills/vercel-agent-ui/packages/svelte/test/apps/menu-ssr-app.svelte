<script lang="ts">
  import type { MenuData } from "@ui-sdk/core/menu"
  import {
    Menu,
    MenuContent,
    MenuItem,
    MenuSub,
    MenuSubContent,
    MenuSubTrigger,
    MenuTrigger,
  } from "../../src/menu"

  let { open = false, items }: { open?: boolean; items?: MenuData } = $props()
</script>

{#if items}
  <Menu defaultOpen={open} {items}><MenuTrigger>File</MenuTrigger></Menu>
{:else}
  <Menu defaultOpen={open}>
    <MenuTrigger>File</MenuTrigger>
    <MenuContent>
      <MenuItem value="new" shortcut="mod+n">New file</MenuItem>
      <MenuSub>
        <MenuSubTrigger>Share</MenuSubTrigger>
        <MenuSubContent><MenuItem value="email">Email</MenuItem></MenuSubContent
        >
      </MenuSub>
    </MenuContent>
  </Menu>
{/if}
