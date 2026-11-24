<script setup lang="ts">
import { CheckIcon, ChevronDownIcon } from "@lucide/vue"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/vue/checkbox"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
} from "@ui-sdk/vue/combobox"
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

const frameworks = [
  { value: "next", label: "Next.js" },
  { value: "sveltekit", label: "SvelteKit" },
  { value: "nuxt", label: "Nuxt" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
  { value: "solidstart", label: "SolidStart" },
  { value: "qwik", label: "Qwik City" },
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
            <CheckIcon aria-hidden="true" />
          </CheckboxIndicator>
        </Checkbox>
        Anchor to the box
      </label>
    </div>
    <div ref="box" data-slot="card">
      <Combobox>
        <ComboboxInput aria-label="Framework" placeholder="Framework" />
        <ComboboxContent
          :side="side"
          :align="align"
          :side-offset="10"
          :align-offset="0"
          :collision-padding="16"
          :anchor="anchored ? box : null"
        >
          <ComboboxEmpty>No frameworks found.</ComboboxEmpty>
          <ComboboxList>
            <ComboboxItem
              v-for="framework in frameworks"
              :key="framework.value"
              :value="framework.value"
              :label="framework.label"
            >
              {{ framework.label }}
              <ComboboxItemIndicator>
                <CheckIcon />
              </ComboboxItemIndicator>
            </ComboboxItem>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  </div>
</template>
