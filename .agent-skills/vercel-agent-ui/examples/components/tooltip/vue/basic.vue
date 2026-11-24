<script setup lang="ts">
import { BookmarkIcon } from "@lucide/vue"
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/vue/tooltip"
</script>

<template>
  <Tooltip default-open>
    <TooltipTrigger aria-label="Add to library">
      <BookmarkIcon aria-hidden="true" />
    </TooltipTrigger>
    <TooltipContent>Add to library</TooltipContent>
  </Tooltip>
</template>
