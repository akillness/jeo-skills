<script setup lang="ts">
import { BoldIcon, ItalicIcon, LinkIcon } from "@lucide/vue"
import { Toggle, ToggleIcon } from "@ui-sdk/vue/toggle"
import { Toolbar, ToolbarButton, ToolbarSeparator } from "@ui-sdk/vue/toolbar"
</script>

<template>
  <div dir="rtl">
    <Toolbar aria-label="تنسيق">
      <Toggle aria-label="غامق">
        <ToggleIcon>
          <BoldIcon />
        </ToggleIcon>
      </Toggle>
      <Toggle aria-label="مائل">
        <ToggleIcon>
          <ItalicIcon />
        </ToggleIcon>
      </Toggle>
      <ToolbarSeparator />
      <ToolbarButton aria-label="إدراج رابط">
        <LinkIcon aria-hidden="true" />
      </ToolbarButton>
    </Toolbar>
  </div>
</template>
