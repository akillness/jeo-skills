<script setup lang="ts">
import { StarIcon } from "@lucide/vue"
import { Toggle, ToggleIcon } from "@ui-sdk/vue/toggle"
</script>

<template>
  <div data-slot="card">
    <div data-slot="stack">
      <h3>Q3 Roadmap</h3>
      <p data-slot="hint">Edited by Hollis Grant</p>
    </div>
    <Toggle aria-label="Star">
      <ToggleIcon data-variant="fill">
        <StarIcon />
      </ToggleIcon>
    </Toggle>
  </div>
</template>
