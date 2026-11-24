<script lang="ts">
  import {
    Resizable,
    ResizableHandle,
    ResizablePanel,
  } from "@ui-sdk/svelte/resizable"
</script>

<Resizable>
  <ResizablePanel defaultSize={35} minSize={20}>
    <h3>Files</h3>
    <ul>
      <li>page.tsx</li>
      <li>layout.tsx</li>
      <li>globals.css</li>
    </ul>
  </ResizablePanel>
  <ResizableHandle aria-label="Resize files" />
  <ResizablePanel defaultSize={65} minSize={40}>
    <Resizable orientation="vertical">
      <ResizablePanel defaultSize={60} minSize={30}>
        <h3>page.tsx</h3>
        <span data-slot="hint">Saved just now</span>
      </ResizablePanel>
      <ResizableHandle aria-label="Resize editor" />
      <ResizablePanel defaultSize={40} minSize={30}>
        <h3>Terminal</h3>
        <span data-slot="hint">Ready on port 3000</span>
      </ResizablePanel>
    </Resizable>
  </ResizablePanel>
</Resizable>
