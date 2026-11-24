<script setup lang="ts">
import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@ui-sdk/vue/resizable"
</script>

<template>
  <Resizable auto-save-id="docs-persistence">
    <ResizablePanel id="docs-sidebar" :default-size="30" :min-size="20">
      <h3>Outline</h3>
      <ul>
        <li>Introduction</li>
        <li>Installation</li>
        <li>Usage</li>
      </ul>
    </ResizablePanel>
    <ResizableHandle aria-label="Resize outline">
      <div />
    </ResizableHandle>
    <ResizablePanel id="docs-content" :min-size="30">
      <h3>Introduction</h3>
      <span data-slot="hint">Last edited by Wren Takahashi</span>
    </ResizablePanel>
  </Resizable>
</template>
