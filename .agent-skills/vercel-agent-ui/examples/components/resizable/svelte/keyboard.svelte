<script lang="ts">
  import {
    Resizable,
    ResizableHandle,
    ResizablePanel,
  } from "@ui-sdk/svelte/resizable"
</script>

<Resizable step={5} largeStep={25}>
  <ResizablePanel defaultSize={50} minSize={20}>
    <h3>Original</h3>
    <span data-slot="hint">v1.2.0</span>
  </ResizablePanel>
  <ResizableHandle aria-label="Resize original" />
  <ResizablePanel defaultSize={50} minSize={20}>
    <h3>Changes</h3>
    <span data-slot="hint">v1.3.0</span>
  </ResizablePanel>
</Resizable>
