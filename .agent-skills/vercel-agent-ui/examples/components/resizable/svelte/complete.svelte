<script lang="ts">
  import {
    Resizable,
    ResizableHandle,
    ResizablePanel,
  } from "@ui-sdk/svelte/resizable"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<Resizable
  onLayoutCommit={(layout, details) =>
    log(`Saved ${layout.map(Math.round).join(" / ")} (${details.reason})`)}
>
  <ResizablePanel defaultSize={40} minSize={20}>
    <h3>Files</h3>
    <ul>
      <li>page.tsx</li>
      <li>layout.tsx</li>
      <li>globals.css</li>
    </ul>
  </ResizablePanel>
  <ResizableHandle aria-label="Resize files" />
  <ResizablePanel minSize={20}>
    <h3>page.tsx</h3>
    <span data-slot="hint">Saved just now</span>
  </ResizablePanel>
</Resizable>
