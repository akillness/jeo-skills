<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import type { ChangeDetails } from "@ui-sdk/core"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/vue/checkbox"
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/vue/tooltip"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const open = ref(false)
const controls = ref<HTMLElement | null>(null)

function onOpenChange(next: boolean, details: ChangeDetails) {
  const target = details.event?.target
  const inControls = target instanceof Node && controls.value?.contains(target)
  if (inControls && details.reason !== "escape-key") {
    return details.cancel()
  }
  log(`${next ? "Opened" : "Closed"} (${details.reason})`)
}
</script>

<template>
  <div data-slot="stack">
    <div ref="controls" data-slot="controls">
      <label data-slot="label">
        <Checkbox v-model:checked="open">
          <CheckboxIndicator>
            <CheckIcon aria-hidden="true" />
          </CheckboxIndicator>
        </Checkbox>
        Open
      </label>
    </div>
    <Tooltip v-model:open="open" @open-change="onOpenChange">
      <TooltipTrigger>Export</TooltipTrigger>
      <TooltipContent>Download as CSV</TooltipContent>
    </Tooltip>
  </div>
</template>
