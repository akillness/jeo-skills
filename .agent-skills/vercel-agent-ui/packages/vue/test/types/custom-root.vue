<script setup lang="ts">
// A primitive of your own through `createParts`: its rendered root's events
// and v-model keep the types of the primitive's callbacks.
import { createChange, definePrimitive, type ChangeDetails } from "@ui-sdk/core"
import { h, ref } from "vue"
import { createParts } from "../../src/primitive"

type Level = "low" | "high"
type LevelOptions = {
  value?: Level
  defaultValue?: Level
  onValueChange?: (value: Level, details: ChangeDetails<"press">) => void
}
const level = definePrimitive({
  name: "level",
  options: {
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
  },
  state: (options: LevelOptions) => ({ value: options.defaultValue ?? "low" }),
  sync: (options) =>
    options.value === undefined ? {} : { value: options.value },
  api: (context) => {
    const change = createChange(context)
    return {
      set: (value: Level) => change("value", value, { reason: "press" }),
    }
  },
  slots: (slot) => ({
    root: slot<{ onCommit?: (value: Level) => void }>({
      props: { onCommit: "callback" },
      attrs: (state) => ({ "data-value": state.value }),
    }),
  }),
})
const { Root: LevelRoot } = createParts(level, { root: "div" })

const current = ref<Level>("low")
const changed = (value: Level, details: ChangeDetails<"press">) => [
  value,
  details.reason,
]
h(LevelRoot, { value: "low", onValueChange: changed })
</script>

<template>
  <LevelRoot v-model="current" @value-change="changed" />
  <LevelRoot @commit="(value: Level) => (current = value)" />
  <!-- @vue-expect-error The value is a Level, not a number. -->
  <LevelRoot @value-change="(value: number) => value" />
  <!-- @vue-expect-error The root slot's callback keeps its Level payload. -->
  <LevelRoot @commit="(value: number) => value" />
</template>
