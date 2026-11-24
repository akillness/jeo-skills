<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItemIndicator,
  MenuTrigger,
} from "@ui-sdk/vue/menu"
import { Menubar } from "@ui-sdk/vue/menubar"
import { ref } from "vue"

const statusBar = ref(true)
</script>

<template>
  <div data-slot="stack">
    <Menubar>
      <Menu>
        <MenuTrigger>View</MenuTrigger>
        <MenuContent>
          <MenuCheckboxItem v-model:checked="statusBar" value="status-bar">
            <MenuItemIndicator>
              <CheckIcon />
            </MenuItemIndicator>
            Status Bar
          </MenuCheckboxItem>
          <MenuCheckboxItem value="activity-bar" default-checked>
            <MenuItemIndicator>
              <CheckIcon />
            </MenuItemIndicator>
            Activity Bar
          </MenuCheckboxItem>
        </MenuContent>
      </Menu>
      <Menu>
        <MenuTrigger>Format</MenuTrigger>
        <MenuContent>
          <MenuCheckboxItem value="strikethrough">
            <MenuItemIndicator>
              <CheckIcon />
            </MenuItemIndicator>
            Strikethrough
          </MenuCheckboxItem>
          <MenuCheckboxItem value="code">
            <MenuItemIndicator>
              <CheckIcon />
            </MenuItemIndicator>
            Code
          </MenuCheckboxItem>
        </MenuContent>
      </Menu>
    </Menubar>
    <output data-slot="output"
      >Status bar {{ statusBar ? "shown" : "hidden" }}</output
    >
  </div>
</template>
