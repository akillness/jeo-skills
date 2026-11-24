<script setup lang="ts">
import {
  ClipboardIcon,
  CopyIcon,
  RedoIcon,
  ScissorsIcon,
  UndoIcon,
} from "@lucide/vue"
import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarSeparator,
} from "@ui-sdk/vue/toolbar"
import { useLog } from "../../../shared/vue/log"

const clipboard = [
  { label: "Cut", icon: ScissorsIcon },
  { label: "Copy", icon: CopyIcon },
  { label: "Paste", icon: ClipboardIcon },
]

const log = useLog()
</script>

<template>
  <Toolbar aria-label="Edit">
    <ToolbarGroup aria-label="Clipboard">
      <ToolbarButton
        v-for="item in clipboard"
        :key="item.label"
        :aria-label="item.label"
        @click="log(item.label)"
      >
        <component :is="item.icon" aria-hidden="true" />
      </ToolbarButton>
    </ToolbarGroup>
    <ToolbarSeparator />
    <ToolbarGroup disabled aria-label="History">
      <ToolbarButton aria-label="Undo">
        <UndoIcon aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton aria-label="Redo">
        <RedoIcon aria-hidden="true" />
      </ToolbarButton>
    </ToolbarGroup>
  </Toolbar>
</template>
