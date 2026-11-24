<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import type { ChangeDetails } from "@ui-sdk/core"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/vue/checkbox"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Input } from "@ui-sdk/vue/input"
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/vue/popover"
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
        <Checkbox
          :checked="open"
          @checked-change="(next) => (open = next === true)"
        >
          <CheckboxIndicator>
            <CheckIcon aria-hidden="true" />
          </CheckboxIndicator>
        </Checkbox>
        Open
      </label>
    </div>
    <Popover v-model:open="open" @open-change="onOpenChange">
      <PopoverTrigger>Set Status</PopoverTrigger>
      <PopoverContent>
        <PopoverTitle>Set a status</PopoverTitle>
        <PopoverDescription
          >Your team sees it next to your name.</PopoverDescription
        >
        <Field>
          <FieldLabel>Status</FieldLabel>
          <Input default-value="In a meeting" />
        </Field>
        <div data-slot="row">
          <PopoverClose>Cancel</PopoverClose>
          <PopoverClose data-variant="solid">Save</PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  </div>
</template>
