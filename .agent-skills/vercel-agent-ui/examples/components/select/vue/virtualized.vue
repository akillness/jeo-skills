<script setup lang="ts">
import { ChevronDownIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectList,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/vue/select"
import { ref } from "vue"

const manyItems = Array.from({ length: 10_000 }, (_, index) => ({
  value: `item-${index + 1}`,
  label: `Item ${index + 1}`,
}))

function visibleRows(
  scrollTop: number,
  height: number,
  count: number,
  row: number
) {
  const start = Math.max(0, Math.floor(scrollTop / row) - 4)
  const end = Math.min(count, Math.ceil((scrollTop + height) / row) + 4)
  return { start, end }
}

function scrollForRow(
  index: number,
  scrollTop: number,
  height: number,
  row: number
) {
  const top = index * row
  if (top < scrollTop) {
    return top
  }
  if (top + row > scrollTop + height) {
    return top + row - height
  }
  return scrollTop
}

const row = 32
const height = 288

const scroller = ref<HTMLDivElement | null>(null)
const scrollTop = ref(0)

function highlight(_value: unknown, { index }: { index: number }) {
  const el = scroller.value
  if (el && index >= 0) {
    el.scrollTop = scrollForRow(index, el.scrollTop, el.clientHeight, row)
  }
}

function visible(items: { value: string; label: string }[]) {
  const { start, end } = visibleRows(scrollTop.value, height, items.length, row)
  return items
    .slice(start, end)
    .map((item, offset) => ({ item, index: start + offset }))
}
</script>

<template>
  <Field>
    <FieldLabel>Item</FieldLabel>
    <Select
      :items="manyItems"
      placeholder="Select an item"
      @highlight="highlight"
    >
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        <div
          ref="scroller"
          :style="{ height: `${height}px` }"
          @scroll="
            scrollTop = ($event.currentTarget as HTMLDivElement).scrollTop
          "
        >
          <SelectList v-slot="{ state }">
            <div :style="{ height: `${state.items.length * row}px` }">
              <SelectItem
                v-for="{ item, index } in visible(
                  state.items as { value: string; label: string }[]
                )"
                :key="item.value"
                :value="item.value"
                :label="item.label"
                :index="index"
                :style="{ top: `${index * row}px`, height: `${row}px` }"
              >
                {{ item.label }}
              </SelectItem>
            </div>
          </SelectList>
        </div>
      </SelectContent>
    </Select>
  </Field>
</template>
