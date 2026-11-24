<script setup lang="ts">
import {
  Menu,
  MenuContent,
  MenuItemIndicator,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@ui-sdk/vue/menu"
import { Menubar } from "@ui-sdk/vue/menubar"
import { ref } from "vue"

const profiles = [
  { value: "hollis", label: "Hollis" },
  { value: "ines", label: "Inès" },
  { value: "kofi", label: "Kofi" },
]

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

const theme = ref("system")
</script>

<template>
  <div data-slot="stack">
    <Menubar>
      <Menu>
        <MenuTrigger>Profiles</MenuTrigger>
        <MenuContent>
          <MenuRadioGroup default-value="ines">
            <MenuRadioItem
              v-for="profile in profiles"
              :key="profile.value"
              :value="profile.value"
            >
              <MenuItemIndicator />
              {{ profile.label }}
            </MenuRadioItem>
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
      <Menu>
        <MenuTrigger>Theme</MenuTrigger>
        <MenuContent>
          <MenuRadioGroup v-model:value="theme">
            <MenuRadioItem
              v-for="option in themes"
              :key="option.value"
              :value="option.value"
            >
              <MenuItemIndicator />
              {{ option.label }}
            </MenuRadioItem>
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
    </Menubar>
    <output data-slot="output">Theme: {{ theme }}</output>
  </div>
</template>
