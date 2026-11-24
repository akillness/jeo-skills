<script setup lang="ts">
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/vue/tooltip"
</script>

<template>
  <Tooltip>
    <TooltipTrigger data-variant="link">
      <template #render="{ props }">
        <a v-bind="props" href="https://example.com/changelog">Changelog</a>
      </template>
    </TooltipTrigger>
    <TooltipContent>See what's new in 2.0</TooltipContent>
  </Tooltip>
</template>
