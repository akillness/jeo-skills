<script setup lang="ts">
import { Toggle, ToggleGroup } from "@ui-sdk/vue/toggle"

const views = [
  { value: "list", label: "قائمة" },
  { value: "grid", label: "شبكة" },
  { value: "cards", label: "بطاقات" },
]
</script>

<template>
  <div dir="rtl">
    <ToggleGroup :default-value="['list']" aria-label="العرض">
      <Toggle v-for="item in views" :key="item.value" :value="item.value">
        {{ item.label }}
      </Toggle>
    </ToggleGroup>
  </div>
</template>
