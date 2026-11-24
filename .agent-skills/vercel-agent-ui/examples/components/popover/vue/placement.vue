<script setup lang="ts">
import { CheckIcon, ChevronDownIcon } from "@lucide/vue"
import {
  Popover,
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
import { ref } from "vue"

const sides = [
  { value: "top", label: "Top" },
  { value: "right", label: "Right" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
]
const aligns = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
]
type Side = "top" | "right" | "bottom" | "left"
type Align = "start" | "center" | "end"

const side = ref<Side>("bottom")
const align = ref<Align>("center")
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
    <Popover>
      <PopoverTrigger>Delivery</PopoverTrigger>
      <PopoverContent :side="side" :align="align" :side-offset="8">
        <PopoverTitle>Delivery window</PopoverTitle>
        <PopoverDescription
          >Arrives Tuesday between 9 AM and noon.</PopoverDescription
        >
      </PopoverContent>
    </Popover>
  </div>
</template>
