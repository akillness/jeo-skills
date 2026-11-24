<script setup lang="ts">
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ListIcon,
  ListOrderedIcon,
} from "@lucide/vue"
import { Toggle, ToggleGroup, ToggleIcon } from "@ui-sdk/vue/toggle"
import { Toolbar, ToolbarSeparator } from "@ui-sdk/vue/toolbar"
import { useLog } from "../../../shared/vue/log"

const alignments = [
  { value: "left", label: "Align left", icon: AlignLeftIcon },
  { value: "center", label: "Align center", icon: AlignCenterIcon },
  { value: "right", label: "Align right", icon: AlignRightIcon },
]

const lists = [
  { value: "bulleted", label: "Bulleted list", icon: ListIcon },
  { value: "numbered", label: "Numbered list", icon: ListOrderedIcon },
]

const log = useLog()
</script>

<template>
  <Toolbar aria-label="Paragraph">
    <ToggleGroup
      :default-value="['left']"
      :deselectable="false"
      aria-label="Alignment"
      @value-change="([value]) => log(`Align ${value}`)"
    >
      <Toggle
        v-for="item in alignments"
        :key="item.value"
        :value="item.value"
        :aria-label="item.label"
      >
        <ToggleIcon>
          <component :is="item.icon" />
        </ToggleIcon>
      </Toggle>
    </ToggleGroup>
    <ToolbarSeparator />
    <ToggleGroup
      aria-label="List"
      @value-change="
        ([value]) =>
          log(lists.find((list) => list.value === value)?.label ?? 'No list')
      "
    >
      <Toggle
        v-for="item in lists"
        :key="item.value"
        :value="item.value"
        :aria-label="item.label"
      >
        <ToggleIcon>
          <component :is="item.icon" />
        </ToggleIcon>
      </Toggle>
    </ToggleGroup>
  </Toolbar>
</template>
