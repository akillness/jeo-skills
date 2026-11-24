<script setup lang="ts">
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPage,
  createCommandController,
} from "@ui-sdk/vue/command"
import { useLog } from "../../../shared/vue/log"

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

const palette = createCommandController()
const log = useLog()
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="palette.push('theme')">Open Themes</button>
      <button type="button" @click="palette.pop()">Back</button>
      <button type="button" @click="palette.setValue('dark')">
        Highlight Dark
      </button>
      <button type="button" @click="palette.setQuery('li')">Search “li”</button>
      <button type="button" @click="palette.run()">Run Highlighted</button>
      <button type="button" @click="palette.focus()">Focus</button>
    </div>
    <Command
      :controller="palette"
      @action="(value: string) => log(`Ran ${value}`)"
    >
      <CommandInput aria-label="Search commands" />
      <CommandList>
        <CommandPage>
          <CommandItem value="theme" page="theme">Change theme…</CommandItem>
        </CommandPage>
        <CommandPage value="theme">
          <CommandItem
            v-for="theme in themes"
            :key="theme.value"
            :value="theme.value"
          >
            {{ theme.label }}
          </CommandItem>
        </CommandPage>
      </CommandList>
    </Command>
  </div>
</template>
