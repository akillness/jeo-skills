<script setup lang="ts">
import { FileIcon } from "@lucide/vue"
import { Listbox, ListboxItem, ListboxItemIcon } from "@ui-sdk/vue/listbox"
import { useLog } from "../../../shared/vue/log"

const files = [
  { value: "readme", label: "README.md" },
  { value: "package", label: "package.json" },
  { value: "tsconfig", label: "tsconfig.json" },
  { value: "index", label: "index.ts" },
  { value: "styles", label: "styles.css" },
  { value: "logo", label: "logo.svg" },
]

const log = useLog()
</script>

<template>
  <Listbox
    multiple
    activation="automatic"
    :default-value="['readme']"
    aria-label="Files"
    @value-change="
      (value, details) => log(`${value.length} selected (${details.reason})`)
    "
  >
    <ListboxItem v-for="file in files" :key="file.value" :value="file.value">
      <ListboxItemIcon>
        <FileIcon aria-hidden="true" />
      </ListboxItemIcon>
      {{ file.label }}
    </ListboxItem>
  </Listbox>
</template>
