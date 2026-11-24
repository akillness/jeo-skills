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
      <h3>Channels</h3>
      <ul>
        <li>general</li>
        <li>design</li>
        <li>releases</li>
      </ul>
    </ResizablePanel>
    <ResizableHandle aria-label="Resize channels">
      <div />
    </ResizableHandle>
    <ResizablePanel :default-size="65" :min-size="20">
      <h3>general</h3>
      <span data-slot="hint">Kofi Mensah: The release notes are ready.</span>
    </ResizablePanel>
  </Resizable>
</template>
