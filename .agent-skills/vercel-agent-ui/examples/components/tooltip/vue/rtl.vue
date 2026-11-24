<script setup lang="ts">
import {
  Tooltip,
  TooltipArrow,
  TooltipContent,
  TooltipTrigger,
} from "@ui-sdk/vue/tooltip"

const sides = [
  { side: "right", label: "يمين" },
  { side: "top", label: "أعلى" },
  { side: "bottom", label: "أسفل" },
  { side: "left", label: "يسار" },
] as const
</script>

<template>
  <div dir="rtl" data-slot="row">
    <Tooltip v-for="{ side, label } in sides" :key="side">
      <TooltipTrigger>{{ label }}</TooltipTrigger>
      <TooltipContent :side="side" align="start" :side-offset="8">
        <TooltipArrow />
        أضف إلى المكتبة
      </TooltipContent>
    </Tooltip>
  </div>
</template>
