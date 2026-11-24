<script setup lang="ts">
import { CornerDownLeftIcon } from "@lucide/vue"
import {
  Command,
  CommandInput,
  CommandItem,
  CommandItemText,
  CommandList,
} from "@ui-sdk/vue/command"

const pages = ["Composition", "Installation", "Styling"]
</script>

<template>
  <Command>
    <CommandInput aria-label="Search docs" placeholder="Search docs…" />
    <CommandList>
      <CommandItem v-for="page in pages" :key="page" :value="page">
        <template #render="{ props, children }">
          <a v-bind="props" :href="`#${page.toLowerCase()}`"
            ><component :is="children"
          /></a>
        </template>
        <template #default="{ state }">
          <CommandItemText v-slot="{ state: text }">
            <template v-for="(segment, index) in text.segments" :key="index">
              <strong v-if="segment.match">{{ segment.text }}</strong>
              <template v-else>{{ segment.text }}</template>
            </template>
          </CommandItemText>
          <CornerDownLeftIcon v-if="state.highlighted" aria-hidden="true" />
        </template>
      </CommandItem>
    </CommandList>
  </Command>
</template>
