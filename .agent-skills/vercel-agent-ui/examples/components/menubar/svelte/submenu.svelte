<script lang="ts">
  import { ChevronRightIcon } from "@lucide/svelte"
  import {
    Menu,
    MenuContent,
    MenuItem,
    MenuSub,
    MenuSubContent,
    MenuSubTrigger,
    MenuTrigger,
  } from "@ui-sdk/svelte/menu"
  import { Menubar } from "@ui-sdk/svelte/menubar"
</script>

<Menubar>
  <Menu>
    <MenuTrigger>File</MenuTrigger>
    <MenuContent>
      <MenuItem>New File</MenuItem>
      <MenuSub>
        <MenuSubTrigger>
          Share
          <ChevronRightIcon aria-hidden="true" />
        </MenuSubTrigger>
        <MenuSubContent>
          <MenuItem>Email link</MenuItem>
          <MenuItem>Messages</MenuItem>
        </MenuSubContent>
      </MenuSub>
    </MenuContent>
  </Menu>
  <Menu>
    <MenuTrigger>Edit</MenuTrigger>
    <MenuContent>
      <MenuItem>Undo</MenuItem>
      <MenuSub>
        <MenuSubTrigger>
          Find
          <ChevronRightIcon aria-hidden="true" />
        </MenuSubTrigger>
        <MenuSubContent>
          <MenuItem>Find…</MenuItem>
          <MenuItem>Find Next</MenuItem>
        </MenuSubContent>
      </MenuSub>
    </MenuContent>
  </Menu>
</Menubar>
