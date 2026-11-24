<script setup lang="ts">
import { CircleQuestionMarkIcon } from "@lucide/vue"
import type { ChangeDetails } from "@ui-sdk/core"
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/vue/popover"
import { ref } from "vue"

const sides = [
  { value: "top", label: "Top" },
  { value: "right", label: "Right" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
] as const
type Side = (typeof sides)[number]["value"]

const open = ref(false)
const side = ref<Side>("bottom")
const controls = ref<HTMLElement | null>(null)

function onOpenChange(next: boolean, details: ChangeDetails) {
  const target = details.event?.target
  const inControls = target instanceof Node && controls.value?.contains(target)
  if (inControls && details.reason !== "escape-key") {
    return details.cancel()
  }
  open.value = next
}
</script>

<template>
  <div data-slot="stack">
    <div ref="controls" data-slot="controls" role="group" aria-label="Side">
      <button
        v-for="option in sides"
        :key="option.value"
        type="button"
        data-size="sm"
        :aria-pressed="side === option.value"
        @click="side = option.value"
      >
        {{ option.label }}
      </button>
    </div>
    <Popover :open="open" @open-change="onOpenChange">
      <PopoverTrigger aria-label="Help">
        <CircleQuestionMarkIcon aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent :side="side" :side-offset="10" :arrow-padding="12">
        <PopoverArrow />
        <PopoverTitle>Keyboard shortcuts</PopoverTitle>
        <PopoverDescription
          >Press ? anywhere to see them all.</PopoverDescription
        >
      </PopoverContent>
    </Popover>
  </div>
</template>
