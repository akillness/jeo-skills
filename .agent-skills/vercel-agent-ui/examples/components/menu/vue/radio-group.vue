<script setup lang="ts">
import {
  Menu,
  MenuContent,
  MenuGroupLabel,
  MenuItemIndicator,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@ui-sdk/vue/menu"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
</script>

<template>
  <Menu>
    <MenuTrigger>Panel</MenuTrigger>
    <MenuContent>
      <MenuRadioGroup
        name="position"
        default-value="bottom"
        @value-change="(value) => log(`Panel at the ${value}`)"
      >
        <MenuGroupLabel>Position</MenuGroupLabel>
        <MenuRadioItem
          v-for="option in ['Top', 'Bottom', 'Right']"
          :key="option"
          :value="option.toLowerCase()"
        >
          <MenuItemIndicator />
          {{ option }}
        </MenuRadioItem>
      </MenuRadioGroup>
      <MenuSeparator />
      <MenuRadioGroup
        default-value="comfortable"
        @value-change="(value) => log(`${value} density`)"
      >
        <MenuGroupLabel>Density</MenuGroupLabel>
        <MenuRadioItem
          v-for="option in ['Compact', 'Comfortable']"
          :key="option"
          :value="option.toLowerCase()"
        >
          <MenuItemIndicator />
          {{ option }}
        </MenuRadioItem>
      </MenuRadioGroup>
    </MenuContent>
  </Menu>
</template>
