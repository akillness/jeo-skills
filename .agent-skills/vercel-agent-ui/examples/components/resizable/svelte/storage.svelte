<script lang="ts">
  import {
    Resizable,
    ResizableHandle,
    ResizablePanel,
    type ResizableStorage,
  } from "@ui-sdk/svelte/resizable"

  const session: ResizableStorage = {
    getItem: (key) => sessionStorage.getItem(key),
    setItem: (key, value) => sessionStorage.setItem(key, value),
  }
</script>

<Resizable autoSaveId="docs-storage" storage={session}>
  <ResizablePanel id="session-chats" defaultSize={35} minSize={20}>
    <h3>Messages</h3>
    <ul>
      <li>Inès Moreau</li>
      <li>Kofi Mensah</li>
      <li>Wren Takahashi</li>
    </ul>
  </ResizablePanel>
  <ResizableHandle aria-label="Resize messages" />
  <ResizablePanel id="session-thread" minSize={20}>
    <h3>Inès Moreau</h3>
    <span data-slot="hint">Can we move the review to Friday?</span>
  </ResizablePanel>
</Resizable>
