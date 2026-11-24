<script setup lang="ts">
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPage,
} from "@ui-sdk/vue/command"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

const value = ref<string | null>("dark")
const query = ref("")
const pages = ref(["theme"])
const log = useLog()
</script>

<template>
  <Command
    v-model:value="value"
    v-model:query="query"
    v-model:pages="pages"
    @value-change="
      (next: string | null, details: { reason: string }) =>
        log(`Highlighted ${next ?? 'nothing'} (${details.reason})`)
    "
    @query-change="
      (next: string, details: { reason: string }) =>
        log(`Query “${next}” (${details.reason})`)
    "
    @pages-change="
      (next: string[], details: { reason: string }) =>
        log(`Pages [${next.join(', ')}] (${details.reason})`)
    "
    @action="(next: string) => log(`Ran ${next}`)"
  >
    <CommandInput aria-label="Search themes" placeholder="Search themes…" />
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
</template>
