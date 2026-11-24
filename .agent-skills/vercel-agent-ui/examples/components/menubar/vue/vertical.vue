<script setup lang="ts">
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@ui-sdk/vue/menu"
import { Menubar } from "@ui-sdk/vue/menubar"
</script>

<template>
  <Menubar orientation="vertical">
    <Menu v-for="label in ['Inbox', 'Drafts', 'Archive']" :key="label">
      <MenuTrigger>{{ label }}</MenuTrigger>
      <MenuContent>
        <MenuItem>Open {{ label }}</MenuItem>
        <MenuItem>Mark all as read</MenuItem>
      </MenuContent>
    </Menu>
  </Menubar>
</template>
