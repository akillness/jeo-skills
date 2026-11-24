<script setup lang="ts">
import { Listbox, ListboxItem } from "@ui-sdk/vue/listbox"

const views = [
  { value: "day", label: "יום" },
  { value: "week", label: "שבוע" },
  { value: "month", label: "חודש" },
]
</script>

<template>
  <div dir="rtl">
    <Listbox orientation="horizontal" default-value="day" aria-label="תצוגה">
      <ListboxItem v-for="view in views" :key="view.value" :value="view.value">
        {{ view.label }}
      </ListboxItem>
    </Listbox>
  </div>
</template>
