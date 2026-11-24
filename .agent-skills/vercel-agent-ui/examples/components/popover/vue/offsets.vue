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
import { reactive } from "vue"

const choices = {
  sideOffset: { label: "Side offset", values: ["4", "8", "16", "24"] },
  alignOffset: { label: "Align offset", values: ["-16", "0", "16"] },
  collisionPadding: { label: "Collision padding", values: ["8", "24", "48"] },
}
type Name = keyof typeof choices

const offsets = reactive<Record<Name, string>>({
  sideOffset: "8",
  alignOffset: "0",
  collisionPadding: "8",
})
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <Select
        v-for="(choice, name) in choices"
        :key="name"
        :items="choice.values"
        :value="offsets[name]"
        @value-change="(next) => next && (offsets[name] = next)"
      >
        <SelectLabel>{{ choice.label }}</SelectLabel>
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon aria-hidden="true" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="value in choice.values"
            :key="value"
            :value="value"
          >
            {{ value }}px
            <SelectItemIndicator>
              <CheckIcon aria-hidden="true" />
            </SelectItemIndicator>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
    <Popover>
      <PopoverTrigger>Delivery</PopoverTrigger>
      <PopoverContent
        align="start"
        :side-offset="Number(offsets.sideOffset)"
        :align-offset="Number(offsets.alignOffset)"
        :collision-padding="Number(offsets.collisionPadding)"
      >
        <PopoverTitle>Delivery window</PopoverTitle>
        <PopoverDescription
          >Arrives Tuesday between 9 AM and noon.</PopoverDescription
        >
      </PopoverContent>
    </Popover>
  </div>
</template>
