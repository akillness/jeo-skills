<script lang="ts">
  import {
    Resizable,
    ResizableHandle,
    ResizablePanel,
  } from "../../src/resizable"
</script>

<Resizable autoSaveId="editor" orientation="vertical">
  <ResizablePanel id="code" defaultSize={70} />
  <ResizableHandle aria-label="Resize terminal" />
  <ResizablePanel id="terminal" />
</Resizable>
