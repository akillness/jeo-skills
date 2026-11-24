<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/vue/checkbox"
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/vue/dialog"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const topics = [
  { label: "Product updates", checked: true },
  { label: "Security alerts", checked: true },
  { label: "Weekly digest", checked: false },
]

const log = useLog()
const open = ref(false)

function onOpenChange(next: boolean, details: { reason: string }) {
  log(`${next ? "Opened" : "Closed"} (${details.reason})`)
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
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
    <Dialog
      v-model:open="open"
      @open-change="onOpenChange"
      @open-change-complete="
        (next: boolean) => log(next ? 'Finished opening' : 'Finished closing')
      "
    >
      <DialogTrigger>Notification Settings</DialogTrigger>
      <DialogBackdrop />
      <DialogContent>
        <div data-slot="stack">
          <DialogTitle>Notification settings</DialogTitle>
          <DialogDescription>Choose what we email you about.</DialogDescription>
        </div>
        <div data-slot="stack">
          <label v-for="topic in topics" :key="topic.label" data-slot="label">
            <Checkbox :default-checked="topic.checked">
              <CheckboxIndicator>
                <CheckIcon aria-hidden="true" />
              </CheckboxIndicator>
            </Checkbox>
            {{ topic.label }}
          </label>
        </div>
        <div data-slot="row">
          <DialogClose data-variant="solid">Done</DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
