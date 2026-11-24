<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItemIndicator,
  MenuSeparator,
  MenuTrigger,
} from "@ui-sdk/vue/menu"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
</script>

<template>
  <Menu
    @checked-change="
      (checked, details) => log(`${details.value} ${checked ? 'on' : 'off'}`)
    "
  >
    <MenuTrigger>View</MenuTrigger>
    <MenuContent>
      <MenuGroup>
        <MenuGroupLabel>Appearance</MenuGroupLabel>
        <MenuCheckboxItem value="status-bar" default-checked>
          <MenuItemIndicator keep-mounted>
            <CheckIcon aria-hidden="true" />
          </MenuItemIndicator>
          Status bar
        </MenuCheckboxItem>
        <MenuCheckboxItem value="minimap">
          <MenuItemIndicator keep-mounted>
            <CheckIcon aria-hidden="true" />
          </MenuItemIndicator>
          Minimap
        </MenuCheckboxItem>
      </MenuGroup>
      <MenuSeparator />
      <MenuCheckboxItem value="line-numbers" default-checked>
        <MenuItemIndicator keep-mounted>
          <CheckIcon aria-hidden="true" />
        </MenuItemIndicator>
        Line numbers
      </MenuCheckboxItem>
      <MenuCheckboxItem value="word-wrap">
        <MenuItemIndicator keep-mounted>
          <CheckIcon aria-hidden="true" />
        </MenuItemIndicator>
        Word wrap
      </MenuCheckboxItem>
    </MenuContent>
  </Menu>
</template>
