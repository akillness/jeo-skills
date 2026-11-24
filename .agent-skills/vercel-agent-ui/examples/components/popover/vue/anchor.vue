<script setup lang="ts">
import { CheckIcon, SlidersHorizontalIcon } from "@lucide/vue"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/vue/checkbox"
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/vue/popover"
import { ref } from "vue"

const types = [
  { label: "Documents", checked: true },
  { label: "Images", checked: false },
  { label: "Shared with me", checked: true },
]

const anchor = ref<HTMLInputElement | null>(null)
</script>

<template>
  <div data-slot="row">
    <input
      ref="anchor"
      type="search"
      placeholder="Search files…"
      aria-label="Search files"
    />
    <Popover>
      <PopoverTrigger aria-label="Search filters">
        <SlidersHorizontalIcon aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent :anchor="anchor" align="start" :side-offset="8">
        <PopoverTitle>Filters</PopoverTitle>
        <PopoverDescription>Show only these kinds of files.</PopoverDescription>
        <div data-slot="stack">
          <label v-for="type in types" :key="type.label" data-slot="label">
            <Checkbox :default-checked="type.checked">
              <CheckboxIndicator>
                <CheckIcon aria-hidden="true" />
              </CheckboxIndicator>
            </Checkbox>
            {{ type.label }}
          </label>
        </div>
        <div data-slot="row">
          <PopoverClose>Cancel</PopoverClose>
          <PopoverClose data-variant="solid">Apply</PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  </div>
</template>
