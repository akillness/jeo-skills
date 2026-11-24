<script setup lang="ts">
import { ChevronRightIcon } from "@lucide/vue"
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "@ui-sdk/vue/menu"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
</script>

<template>
  <Menu
    @open-change="(open) => log(open ? 'Opening' : 'Closing')"
    @open-change-complete="
      (open) => log(open ? 'Finished opening' : 'Finished closing')
    "
  >
    <MenuTrigger>Animated</MenuTrigger>
    <MenuContent keep-mounted>
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
</template>
