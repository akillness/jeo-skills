<script setup lang="ts">
import { usePrimitive } from "@ui-sdk/vue/primitive"
import { ref } from "vue"
import { rating } from "../rating-stages/state"

const value = ref(0)
const handle = usePrimitive(rating, () => ({
  onValueChange: (next: number) => (value.value = next),
}))
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button
        type="button"
        data-size="sm"
        @click="(event) => handle.api.rate(3, event)"
      >
        Set to 3
      </button>
      <button
        type="button"
        data-size="sm"
        @click="(event) => handle.api.rate(0, event)"
      >
        Reset
      </button>
    </div>
    <div data-slot="rating-readout">
      <output data-slot="rating-value" data-value aria-label="Rating">
        {{ value }}
      </output>
      <span data-slot="hint">Rating</span>
    </div>
  </div>
</template>
