<script setup lang="ts">
import { CheckIcon, ChevronDownIcon } from "@lucide/vue"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/vue/select"
import {
  Toast,
  ToastDescription,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/vue/toast"
import { onUnmounted, ref } from "vue"

const sides = [
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
]
const aligns = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
]
type Side = "top" | "bottom"
type Align = "start" | "center" | "end"

const toast = createToaster()
const side = ref<Side>("bottom")
const align = ref<Align>("end")
onUnmounted(() => {
  toast.dismiss()
})
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <Select
        :items="sides"
        :value="side"
        @value-change="(next) => next && (side = next as Side)"
      >
        <SelectLabel>Side</SelectLabel>
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon aria-hidden="true" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in sides"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
            <SelectItemIndicator>
              <CheckIcon aria-hidden="true" />
            </SelectItemIndicator>
          </SelectItem>
        </SelectContent>
      </Select>
      <Select
        :items="aligns"
        :value="align"
        @value-change="(next) => next && (align = next as Align)"
      >
        <SelectLabel>Align</SelectLabel>
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon aria-hidden="true" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in aligns"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
            <SelectItemIndicator>
              <CheckIcon aria-hidden="true" />
            </SelectItemIndicator>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
    <button
      @click="
        toast('Event created', { description: 'Friday, June 12 at 10:00 AM' })
      "
    >
      Create Event
    </button>
    <ToastRegion :toaster="toast" :side="side" :align="align">
      <Toast>
        <div data-slot="stack">
          <ToastTitle />
          <ToastDescription />
        </div>
      </Toast>
    </ToastRegion>
  </div>
</template>
