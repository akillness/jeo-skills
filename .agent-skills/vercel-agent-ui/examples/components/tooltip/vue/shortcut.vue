<script setup lang="ts">
import { SaveIcon } from "@lucide/vue"
import { registerShortcut } from "@ui-sdk/core/shortcuts"
import {
  Tooltip,
  TooltipContent,
  TooltipShortcut,
  TooltipTrigger,
} from "@ui-sdk/vue/tooltip"
import { onMounted, onUnmounted } from "vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const offs: (() => void)[] = []

onMounted(() => {
  offs.push(
    registerShortcut("mod+s", () => log("Saved")),
    registerShortcut("mod+shift+e", () => log("Shared"))
  )
})
onUnmounted(() => offs.forEach((off) => off()))
</script>

<template>
  <div data-slot="row">
    <Tooltip shortcut="mod+s">
      <TooltipTrigger aria-label="Save" @click="log('Saved')">
        <SaveIcon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>
        Save
        <TooltipShortcut />
      </TooltipContent>
    </Tooltip>
    <Tooltip shortcut="mod+shift+e">
      <TooltipTrigger @click="log('Shared')">Share</TooltipTrigger>
      <TooltipContent>
        Share with your team
        <TooltipShortcut />
      </TooltipContent>
    </Tooltip>
  </div>
</template>
