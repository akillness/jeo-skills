<script setup lang="ts">
import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
  type ResizableStorage,
} from "@ui-sdk/vue/resizable"

const session: ResizableStorage = {
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
}
</script>

<template>
  <Resizable auto-save-id="docs-storage" :storage="session">
    <ResizablePanel id="session-chats" :default-size="35" :min-size="20">
      <h3>Messages</h3>
      <ul>
        <li>Inès Moreau</li>
        <li>Kofi Mensah</li>
        <li>Wren Takahashi</li>
      </ul>
    </ResizablePanel>
    <ResizableHandle aria-label="Resize messages" />
    <ResizablePanel id="session-thread" :min-size="20">
      <h3>Inès Moreau</h3>
      <span data-slot="hint">Can we move the review to Friday?</span>
    </ResizablePanel>
  </Resizable>
</template>
