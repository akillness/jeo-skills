<script setup lang="ts">
import { CheckIcon, ChevronDownIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Textarea } from "@ui-sdk/vue/textarea"
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/vue/popover"
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
  { value: "false", label: "Non-modal" },
  { value: "trap-focus", label: "Trap focus" },
  { value: "true", label: "Modal" },
]

type Mode = "false" | "trap-focus" | "true"

const notes = {
  false: "Tab can leave, and focus leaving closes it.",
  "trap-focus": "Tab stays inside. The page still scrolls and takes clicks.",
  true: "Tab stays inside. The page is inert and doesn't scroll.",
}

const mode = ref<Mode>("false")
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
          <ChevronDownIcon aria-hidden="true" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in modes"
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
    <Popover :modal="modal">
      <PopoverTrigger>Add Comment</PopoverTrigger>
      <PopoverContent>
        <PopoverTitle>Add a comment</PopoverTitle>
        <PopoverDescription>{{ notes[mode] }}</PopoverDescription>
        <Field>
          <FieldLabel>Comment</FieldLabel>
          <Textarea default-value="Looks good to me." />
        </Field>
        <div data-slot="row">
          <PopoverClose>Cancel</PopoverClose>
          <PopoverClose data-variant="solid">Comment</PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  </div>
</template>
