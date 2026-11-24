<script setup lang="ts">
import {
  TextAlignCenterIcon,
  TextAlignEndIcon,
  TextAlignStartIcon,
} from "@lucide/vue"
import { Toggle, ToggleGroup, ToggleIcon } from "@ui-sdk/vue/toggle"

const alignments = [
  {
    value: "start",
    label: "Align start",
    icon: TextAlignStartIcon,
    mirror: true,
  },
  {
    value: "center",
    label: "Align center",
    icon: TextAlignCenterIcon,
    mirror: false,
  },
  { value: "end", label: "Align end", icon: TextAlignEndIcon, mirror: true },
]
</script>

<template>
  <ToggleGroup
    :default-value="['start']"
    :deselectable="false"
    aria-label="Text alignment"
  >
    <Toggle
      v-for="item in alignments"
      :key="item.value"
      :value="item.value"
      :aria-label="item.label"
    >
      <ToggleIcon :mirror="item.mirror">
        <component :is="item.icon" />
      </ToggleIcon>
    </Toggle>
  </ToggleGroup>
</template>
