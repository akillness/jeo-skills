<script setup lang="ts">
import { CheckIcon, ChevronDownIcon } from "@lucide/vue"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/vue/select"
import { computed, ref } from "vue"

const modes = [
  { value: "true", label: "Modal" },
  { value: "trap-focus", label: "Trap focus" },
  { value: "false", label: "Non-modal" },
]

type Mode = "true" | "trap-focus" | "false"

const notes = {
  true: "The rest of the page is inert and doesn't scroll.",
  "trap-focus":
    "Tab stays inside, and the page still scrolls and takes clicks.",
  false:
    "The page stays usable. Tab leaves the notes, and Escape closes them while focus is inside.",
}

const mode = ref<Mode>("false")
const outside = ref(false)
const modal = computed(() =>
  mode.value === "true" ? true : mode.value === "false" ? false : "trap-focus"
)
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <Select
        :items="modes"
        :value="mode"
        @value-change="(next) => next && (mode = next as Mode)"
      >
        <SelectLabel>Modal</SelectLabel>
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in modes"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        </SelectContent>
      </Select>
      <label data-slot="label">
        <Checkbox
          :checked="outside"
          @checked-change="(next) => (outside = next === true)"
        >
          <CheckboxIndicator>
            <CheckIcon aria-hidden="true" />
          </CheckboxIndicator>
        </Checkbox>
        Close on outside press
      </label>
    </div>
    <Dialog :modal="modal" :close-on-outside-press="outside">
      <DialogTrigger>Open Notes</DialogTrigger>
      <DialogBackdrop v-if="modal === true" />
      <DialogContent>
        <div data-slot="stack">
          <DialogTitle>Notes</DialogTitle>
          <DialogDescription>{{ notes[mode] }}</DialogDescription>
        </div>
        <textarea aria-label="Notes">
Call the printer about the proofs.</textarea>
        <div data-slot="row">
          <DialogClose data-variant="solid">Done</DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
