<script setup lang="ts">
import { Toolbar, ToolbarButton } from "@ui-sdk/vue/toolbar"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
</script>

<template>
  <Toolbar aria-label="Message">
    <ToolbarButton @click="log('Reply')">Reply</ToolbarButton>
    <ToolbarButton disabled @click="log('Archive')">Archive</ToolbarButton>
    <ToolbarButton
      disabled
      :focusable-when-disabled="false"
      @click="log('Delete')"
      >Delete</ToolbarButton
    >
  </Toolbar>
</template>
