<script setup lang="ts">
import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@ui-sdk/vue/resizable"
</script>

<template>
  <Resizable>
    <ResizablePanel default-size="200px" min-size="160px" max-size="320px">
      <h3>Docs</h3>
      <ul>
        <li>Getting Started</li>
        <li>Components</li>
        <li>Guides</li>
      </ul>
    </ResizablePanel>
    <ResizableHandle aria-label="Resize navigation">
      <div />
    </ResizableHandle>
    <ResizablePanel :min-size="30">
      <h3>Getting Started</h3>
      <span data-slot="hint">Install the packages</span>
    </ResizablePanel>
  </Resizable>
</template>
