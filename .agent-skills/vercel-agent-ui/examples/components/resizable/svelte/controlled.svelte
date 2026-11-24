<script lang="ts">
  import {
    Resizable,
    ResizableHandle,
    ResizablePanel,
  } from "@ui-sdk/svelte/resizable"
  import { useLog } from "../../../shared/svelte/log"

  const format = (layout: number[]) => layout.map(Math.round).join(" / ")

  const log = useLog()
  let layout = $state([30, 70])
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => (layout = [50, 50])}
      >Split Evenly</button
    >
    <button type="button" onclick={() => (layout = [30, 70])}>Reset</button>
  </div>
  <Resizable
    bind:layout
    onLayoutChange={(next, details) => {
      if (format(next) !== format(layout)) {
        log(`${format(next)} (${details.reason})`)
      }
    }}
  >
    <ResizablePanel minSize={20}>
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
</div>
