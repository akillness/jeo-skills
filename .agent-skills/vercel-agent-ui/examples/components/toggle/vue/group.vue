<script setup lang="ts">
import { BoldIcon, ItalicIcon, UnderlineIcon } from "@lucide/vue"
import { Toggle, ToggleGroup, ToggleIcon } from "@ui-sdk/vue/toggle"
</script>

<template>
  <ToggleGroup multiple aria-label="Text formatting">
    <Toggle value="bold" aria-label="Bold">
      <ToggleIcon>
        <BoldIcon />
      </ToggleIcon>
    </Toggle>
    <Toggle value="italic" aria-label="Italic">
      <ToggleIcon>
        <ItalicIcon />
      </ToggleIcon>
    </Toggle>
    <Toggle value="underline" aria-label="Underline">
      <ToggleIcon>
        <UnderlineIcon />
      </ToggleIcon>
    </Toggle>
  </ToggleGroup>
</template>
