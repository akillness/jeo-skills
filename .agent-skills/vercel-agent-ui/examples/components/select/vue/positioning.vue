<script setup lang="ts">
import { CheckIcon, ChevronDownIcon } from "@lucide/vue"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/vue/checkbox"
import {
  Select,
  SelectArrow,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/vue/select"
import { ref } from "vue"

const fonts = [
  { value: "inter", label: "Inter" },
  { value: "geist", label: "Geist" },
  { value: "source-serif", label: "Source Serif" },
  { value: "geist-mono", label: "Geist Mono" },
]

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
const align = ref<Align>("start")
const box = ref<HTMLDivElement | null>(null)
const anchored = ref(false)
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
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in sides"
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
      <Select
        :items="aligns"
        :value="align"
        @value-change="(next) => next && (align = next as Align)"
      >
        <SelectLabel>Align</SelectLabel>
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in aligns"
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
          :checked="anchored"
          @checked-change="(next) => (anchored = next === true)"
        >
          <CheckboxIndicator>
            <CheckIcon />
          </CheckboxIndicator>
        </Checkbox>
        Anchor to the box
      </label>
    </div>
    <div ref="box" data-slot="card">
      <Select default-value="inter">
        <SelectTrigger aria-label="Font">
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent
          :side="side"
          :align="align"
          :side-offset="10"
          :align-offset="0"
          :collision-padding="16"
          :anchor="anchored ? box : null"
        >
          <SelectArrow />
          <SelectItem
            v-for="font in fonts"
            :key="font.value"
            :value="font.value"
          >
            {{ font.label }}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>
</template>
