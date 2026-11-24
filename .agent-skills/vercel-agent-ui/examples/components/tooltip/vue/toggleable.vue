<script setup lang="ts">
import { InfoIcon } from "@lucide/vue"
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/vue/tooltip"
</script>

<template>
  <div data-slot="row">
    <span data-slot="label">Storage</span>
    <Tooltip toggleable>
      <TooltipTrigger aria-label="About storage" data-size="sm">
        <InfoIcon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>Files in the trash still use storage.</TooltipContent>
    </Tooltip>
    <span data-slot="hint">12.4 of 15 GB used</span>
  </div>
</template>
