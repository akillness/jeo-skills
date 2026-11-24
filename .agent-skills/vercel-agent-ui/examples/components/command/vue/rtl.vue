<script setup lang="ts">
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@ui-sdk/vue/command"

const commands = [
  { value: "calendar", label: "التقويم" },
  { value: "search", label: "البحث" },
  { value: "settings", label: "الإعدادات" },
  { value: "profile", label: "الملف الشخصي" },
]
</script>

<template>
  <div dir="rtl" data-slot="stack">
    <Command>
      <CommandInput aria-label="ابحث عن أمر" placeholder="ابحث…" />
      <CommandEmpty>لا توجد نتائج.</CommandEmpty>
      <CommandList>
        <CommandItem
          v-for="item in commands"
          :key="item.value"
          :value="item.value"
          :label="item.label"
        >
          {{ item.label }}
        </CommandItem>
      </CommandList>
    </Command>
  </div>
</template>
