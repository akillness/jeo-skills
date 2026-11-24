<script setup lang="ts">
import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@ui-sdk/vue/resizable"
</script>

<template>
  <Resizable>
    <ResizablePanel :default-size="35" :min-size="20">
      <h3>Files</h3>
      <ul>
        <li>page.tsx</li>
        <li>layout.tsx</li>
        <li>globals.css</li>
      </ul>
    </ResizablePanel>
    <ResizableHandle aria-label="Resize files" />
    <ResizablePanel :default-size="65" :min-size="40">
      <Resizable orientation="vertical">
        <ResizablePanel :default-size="60" :min-size="30">
          <h3>page.tsx</h3>
          <span data-slot="hint">Saved just now</span>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize editor" />
        <ResizablePanel :default-size="40" :min-size="30">
          <h3>Terminal</h3>
          <span data-slot="hint">Ready on port 3000</span>
        </ResizablePanel>
      </Resizable>
    </ResizablePanel>
  </Resizable>
</template>
