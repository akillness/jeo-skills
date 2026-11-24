<script setup lang="ts">
import { ArchiveIcon } from "@lucide/vue"
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/vue/tooltip"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
</script>

<template>
  <Tooltip
    @open-change="(open) => log(open ? 'Opening' : 'Closing')"
    @open-change-complete="(open) => log(open ? 'Open' : 'Closed')"
  >
    <TooltipTrigger aria-label="Archive">
      <ArchiveIcon aria-hidden="true" />
    </TooltipTrigger>
    <TooltipContent>Archive</TooltipContent>
  </Tooltip>
</template>
