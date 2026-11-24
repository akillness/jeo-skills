<script setup lang="ts">
import {
  MousePointer2Icon,
  PencilIcon,
  SquareIcon,
  Trash2Icon,
  TypeIcon,
} from "@lucide/vue"
import { Toggle, ToggleGroup, ToggleIcon } from "@ui-sdk/vue/toggle"
import { Toolbar, ToolbarButton, ToolbarSeparator } from "@ui-sdk/vue/toolbar"
import { useLog } from "../../../shared/vue/log"

const tools = [
  { value: "select", label: "Select", icon: MousePointer2Icon },
  { value: "draw", label: "Draw", icon: PencilIcon },
  { value: "shape", label: "Shape", icon: SquareIcon },
  { value: "text", label: "Text", icon: TypeIcon },
]

const log = useLog()
</script>

<template>
  <Toolbar orientation="vertical" aria-label="Canvas">
    <ToggleGroup
      :default-value="['select']"
      :deselectable="false"
      orientation="vertical"
      aria-label="Tool"
      @value-change="
        ([value]) =>
          log(`${tools.find((tool) => tool.value === value)?.label} tool`)
      "
    >
      <Toggle
        v-for="tool in tools"
        :key="tool.value"
        :value="tool.value"
        :aria-label="tool.label"
      >
        <ToggleIcon>
          <component :is="tool.icon" />
        </ToggleIcon>
      </Toggle>
    </ToggleGroup>
    <ToolbarSeparator />
    <ToolbarButton aria-label="Delete" @click="log('Deleted selection')">
      <Trash2Icon aria-hidden="true" />
    </ToolbarButton>
  </Toolbar>
</template>
