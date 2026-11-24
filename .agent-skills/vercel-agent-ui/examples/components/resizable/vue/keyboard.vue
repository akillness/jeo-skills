<script setup lang="ts">
import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@ui-sdk/vue/resizable"
</script>

<template>
  <Resizable :step="5" :large-step="25">
    <ResizablePanel :default-size="50" :min-size="20">
      <h3>Original</h3>
      <span data-slot="hint">v1.2.0</span>
    </ResizablePanel>
    <ResizableHandle aria-label="Resize original" />
    <ResizablePanel :default-size="50" :min-size="20">
      <h3>Changes</h3>
      <span data-slot="hint">v1.3.0</span>
    </ResizablePanel>
  </Resizable>
</template>
