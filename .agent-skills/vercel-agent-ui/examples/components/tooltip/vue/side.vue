<script setup lang="ts">
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/vue/tooltip"

const sides = [
  { side: "top", label: "Top" },
  { side: "left", label: "Left" },
  { side: "right", label: "Right" },
  { side: "bottom", label: "Bottom" },
] as const
</script>

<template>
  <div data-slot="grid">
    <Tooltip v-for="{ side, label } in sides" :key="side">
      <TooltipTrigger>{{ label }}</TooltipTrigger>
      <TooltipContent :side="side">Add to library</TooltipContent>
    </Tooltip>
  </div>
</template>
