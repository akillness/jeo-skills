<script setup lang="ts">
import { HeartIcon } from "@lucide/vue"
import { Toggle, ToggleIcon } from "@ui-sdk/vue/toggle"
</script>

<template>
  <Toggle aria-label="Favorite">
    <template #render="{ props, state }">
      <button v-bind="props">
        <ToggleIcon>
          <HeartIcon :fill="state.pressed ? 'currentColor' : 'none'" />
        </ToggleIcon>
      </button>
    </template>
  </Toggle>
</template>
