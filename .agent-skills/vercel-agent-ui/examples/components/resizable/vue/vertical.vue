<script setup lang="ts">
import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@ui-sdk/vue/resizable"
</script>

<template>
  <Resizable orientation="vertical">
    <ResizablePanel :default-size="45" :min-size="25">
      <h3>Inbox</h3>
      <span data-slot="hint">3 unread messages</span>
    </ResizablePanel>
    <ResizableHandle aria-label="Resize inbox" />
    <ResizablePanel :default-size="55" :min-size="25">
      <h3>Quarterly report</h3>
      <span data-slot="hint">From Hollis Grant</span>
    </ResizablePanel>
  </Resizable>
</template>
