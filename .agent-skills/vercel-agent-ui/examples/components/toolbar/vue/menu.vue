<script setup lang="ts">
import { ChevronDownIcon } from "@lucide/vue"
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@ui-sdk/vue/menu"
import { Toolbar, ToolbarButton } from "@ui-sdk/vue/toolbar"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
</script>

<template>
  <Toolbar aria-label="Document">
    <ToolbarButton @click="log('Saved')">Save</ToolbarButton>
    <Menu @action="(value) => log(`Shared by ${value}`)">
      <ToolbarButton>
        <template #render="{ props }">
          <MenuTrigger v-bind="props">
            Share
            <ChevronDownIcon aria-hidden="true" />
          </MenuTrigger>
        </template>
      </ToolbarButton>
      <MenuContent>
        <MenuItem value="email">Email</MenuItem>
        <MenuItem value="link">Copy Link</MenuItem>
      </MenuContent>
    </Menu>
    <ToolbarButton @click="log('Printed')">Print</ToolbarButton>
  </Toolbar>
</template>
