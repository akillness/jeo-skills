<script setup lang="ts">
import { BoldIcon, ItalicIcon, UnderlineIcon } from "@lucide/vue"
import {
  createTooltipController,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ui-sdk/vue/tooltip"

const formats = [
  { icon: BoldIcon, label: "Bold" },
  { icon: ItalicIcon, label: "Italic" },
  { icon: UnderlineIcon, label: "Underline" },
]

const tooltip = createTooltipController<string>()
const LabelTooltipContent = TooltipContent<string>
</script>

<template>
  <div data-slot="row" role="group" aria-label="Formatting">
    <TooltipTrigger
      v-for="format in formats"
      :key="format.label"
      :controller="tooltip"
      :payload="format.label"
      :aria-label="format.label"
    >
      <component :is="format.icon" aria-hidden="true" />
    </TooltipTrigger>
    <Tooltip :controller="tooltip">
      <LabelTooltipContent v-slot="{ state }">{{
        state.payload
      }}</LabelTooltipContent>
    </Tooltip>
  </div>
</template>
