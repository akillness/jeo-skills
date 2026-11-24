<script setup lang="ts">
import { BoldIcon, ItalicIcon, LinkIcon, UnderlineIcon } from "@lucide/vue"
import { Toggle, ToggleIcon } from "@ui-sdk/vue/toggle"
import { Toolbar, ToolbarButton, ToolbarSeparator } from "@ui-sdk/vue/toolbar"
import { useLog } from "../../../shared/vue/log"

const styles = [
  { label: "Bold", icon: BoldIcon },
  { label: "Italic", icon: ItalicIcon },
  { label: "Underline", icon: UnderlineIcon },
]

const log = useLog()
</script>

<template>
  <Toolbar aria-label="Formatting">
    <Toggle
      v-for="style in styles"
      :key="style.label"
      :aria-label="style.label"
      @pressed-change="
        (pressed) => log(`${style.label} ${pressed ? 'on' : 'off'}`)
      "
    >
      <ToggleIcon>
        <component :is="style.icon" />
      </ToggleIcon>
    </Toggle>
    <ToolbarSeparator />
    <ToolbarButton aria-label="Insert link" @click="log('Insert link')">
      <LinkIcon aria-hidden="true" />
    </ToolbarButton>
  </Toolbar>
</template>
