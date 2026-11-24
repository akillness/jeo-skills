<script setup lang="ts">
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/vue/popover"

const aligns = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
] as const
</script>

<template>
  <div data-slot="row">
    <Popover v-for="align in aligns" :key="align.value">
      <PopoverTrigger>{{ align.label }}</PopoverTrigger>
      <PopoverContent :align="align.value" :side-offset="8">
        <PopoverTitle>Delivery window</PopoverTitle>
        <PopoverDescription
          >Arrives Tuesday between 9 AM and noon.</PopoverDescription
        >
      </PopoverContent>
    </Popover>
  </div>
</template>
