<script setup lang="ts">
import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
  type ResizableLayoutCommitDetails,
} from "@ui-sdk/vue/resizable"
import { useLog } from "../../../shared/vue/log"

const log = useLog()

function onLayoutCommit(
  layout: number[],
  details: ResizableLayoutCommitDetails
) {
  log(`Saved ${layout.map(Math.round).join(" / ")} (${details.reason})`)
}
</script>

<template>
  <Resizable @layout-commit="onLayoutCommit">
    <ResizablePanel :default-size="40" :min-size="20">
      <h3>Files</h3>
      <ul>
        <li>page.tsx</li>
        <li>layout.tsx</li>
        <li>globals.css</li>
      </ul>
    </ResizablePanel>
    <ResizableHandle aria-label="Resize files" />
    <ResizablePanel :min-size="20">
      <h3>page.tsx</h3>
      <span data-slot="hint">Saved just now</span>
    </ResizablePanel>
  </Resizable>
</template>
