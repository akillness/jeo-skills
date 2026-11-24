<script setup lang="ts">
import { BoldIcon, ItalicIcon, LinkIcon } from "@lucide/vue"
import { useShortcut } from "@ui-sdk/vue/shortcuts"
import {
  createToolbarController,
  Toolbar,
  ToolbarButton,
} from "@ui-sdk/vue/toolbar"
import { useLog } from "../../../shared/vue/log"

const actions = [
  { label: "Bold", icon: BoldIcon },
  { label: "Italic", icon: ItalicIcon },
  { label: "Insert link", icon: LinkIcon },
]

const log = useLog()
const toolbar = createToolbarController()
useShortcut("alt+f10", () => toolbar.focus(), { allowInInput: true })
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="toolbar.focus()">Focus Toolbar</button>
    </div>
    <Toolbar :controller="toolbar" aria-label="Notes formatting">
      <ToolbarButton
        v-for="action in actions"
        :key="action.label"
        :aria-label="action.label"
        @click="log(action.label)"
      >
        <component :is="action.icon" aria-hidden="true" />
      </ToolbarButton>
    </Toolbar>
    <textarea aria-label="Notes" placeholder="Type, then press Alt+F10" />
  </div>
</template>
