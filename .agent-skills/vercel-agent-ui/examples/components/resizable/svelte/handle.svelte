<script lang="ts">
  import {
    Resizable,
    ResizableHandle,
    ResizablePanel,
  } from "@ui-sdk/svelte/resizable"
</script>

<Resizable>
  <ResizablePanel defaultSize={35} minSize={20}>
    <h3>Channels</h3>
    <ul>
      <li>general</li>
      <li>design</li>
      <li>releases</li>
    </ul>
  </ResizablePanel>
  <ResizableHandle aria-label="Resize channels">
    <div></div>
  </ResizableHandle>
  <ResizablePanel defaultSize={65} minSize={20}>
    <h3>general</h3>
    <span data-slot="hint">Kofi Mensah: The release notes are ready.</span>
  </ResizablePanel>
</Resizable>
