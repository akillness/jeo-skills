<script setup lang="ts">
import { CheckIcon, CopyIcon } from "@lucide/vue"
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/vue/tooltip"
import { ref } from "vue"

const command = "npm install @ui-sdk/vue"
const copied = ref(false)

function copy() {
  navigator.clipboard?.writeText(command).catch(() => {})
  copied.value = true
}
</script>

<template>
  <div data-slot="row">
    <code>{{ command }}</code>
    <Tooltip
      :close-on-press="false"
      @open-change-complete="(open) => !open && (copied = false)"
    >
      <TooltipTrigger :aria-label="copied ? 'Copied' : 'Copy'" @click="copy">
        <CheckIcon v-if="copied" aria-hidden="true" />
        <CopyIcon v-else aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{{ copied ? "Copied" : "Copy" }}</TooltipContent>
    </Tooltip>
  </div>
</template>
