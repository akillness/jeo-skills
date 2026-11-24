<script setup lang="ts">
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from "@ui-sdk/vue/command"
import { ref } from "vue"

const commands = Array.from({ length: 10_000 }, (_, index) => ({
  value: `command-${index + 1}`,
  label: `Command ${index + 1}`,
}))

const row = 32
const height = 256

const scroller = ref<HTMLDivElement | null>(null)
const scrollTop = ref(0)

function onValueChange(_value: string | null, { index }: { index: number }) {
  const el = scroller.value
  if (!el || index < 0) {
    return
  }
  const top = index * row
  if (top < el.scrollTop) {
    el.scrollTop = top
  } else if (top + row > el.scrollTop + el.clientHeight) {
    el.scrollTop = top + row - el.clientHeight
  }
}

function visible(items: typeof commands) {
  const start = Math.max(0, Math.floor(scrollTop.value / row) - 4)
  const end = Math.min(
    items.length,
    Math.ceil((scrollTop.value + height) / row) + 4
  )
  return items
    .slice(start, end)
    .map((item, offset) => ({ item, index: start + offset }))
}
</script>

<template>
  <Command :items="commands" @value-change="onValueChange">
    <CommandInput
      aria-label="Search 10,000 commands"
      placeholder="Search 10,000 commands…"
    />
    <div
      ref="scroller"
      @scroll="scrollTop = ($event.currentTarget as HTMLDivElement).scrollTop"
    >
      <CommandList v-slot="{ state }">
        <div :style="{ height: `${state.items.length * row}px` }">
          <CommandItem
            v-for="{ item, index } in visible(state.items as typeof commands)"
            :key="item.value"
            :value="item.value"
            :label="item.label"
            :index="index"
            :style="{ top: `${index * row}px` }"
          >
            {{ item.label }}
          </CommandItem>
        </div>
      </CommandList>
    </div>
  </Command>
</template>
