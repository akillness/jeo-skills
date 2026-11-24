<script setup lang="ts">
import { BookmarkIcon } from "@lucide/vue"
import { Toggle, ToggleIcon } from "@ui-sdk/vue/toggle"
</script>

<template>
  <div dir="rtl">
    <Toggle>
      <ToggleIcon data-variant="fill">
        <BookmarkIcon />
      </ToggleIcon>
      إشارة مرجعية
    </Toggle>
  </div>
</template>
