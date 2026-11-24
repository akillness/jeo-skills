<script setup lang="ts">
import { ChevronRightIcon } from "@lucide/vue"
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "@ui-sdk/vue/menu"
import { Menubar } from "@ui-sdk/vue/menubar"
</script>

<template>
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
</template>
