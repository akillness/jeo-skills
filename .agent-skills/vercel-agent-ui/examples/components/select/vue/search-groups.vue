<script setup lang="ts">
import { CheckIcon, ChevronDownIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  Select,
  SelectContent,
  SelectEmpty,
  SelectGroup,
  SelectGroupLabel,
  SelectInput,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectList,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/vue/select"

const regions = [
  {
    label: "Americas",
    items: [
      { value: "br", label: "Brazil" },
      { value: "ca", label: "Canada" },
      { value: "mx", label: "Mexico" },
    ],
  },
  {
    label: "Europe",
    items: [
      { value: "fr", label: "France" },
      { value: "de", label: "Germany" },
      { value: "es", label: "Spain" },
    ],
  },
  {
    label: "Asia Pacific",
    items: [
      { value: "au", label: "Australia" },
      { value: "jp", label: "Japan" },
      { value: "sg", label: "Singapore" },
    ],
  },
]
</script>

<template>
  <Field>
    <FieldLabel>Country</FieldLabel>
    <Select placeholder="Select a country">
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        <SelectInput
          aria-label="Search countries"
          placeholder="Search countries…"
        />
        <SelectEmpty>No countries found.</SelectEmpty>
        <SelectList>
          <SelectGroup v-for="group in regions" :key="group.label">
            <SelectGroupLabel>{{ group.label }}</SelectGroupLabel>
            <SelectItem
              v-for="item in group.items"
              :key="item.value"
              :value="item.value"
              :label="item.label"
            >
              <SelectItemText>
                <template #render="{ props, state }">
                  <span v-bind="props">
                    <template
                      v-for="(segment, index) in state.segments"
                      :key="index"
                    >
                      <b v-if="segment.match">{{ segment.text }}</b>
                      <template v-else>{{ segment.text }}</template>
                    </template>
                  </span>
                </template>
              </SelectItemText>
              <SelectItemIndicator>
                <CheckIcon />
              </SelectItemIndicator>
            </SelectItem>
          </SelectGroup>
        </SelectList>
      </SelectContent>
    </Select>
  </Field>
</template>
