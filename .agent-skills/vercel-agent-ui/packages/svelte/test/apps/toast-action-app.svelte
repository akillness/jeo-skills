<script lang="ts">
  import {
    Toast,
    ToastAction,
    ToastRegion,
    ToastTitle,
    type Toaster,
  } from "../../src/toast"

  let {
    log,
    toaster,
  }: { log: (entry: string) => void; toaster: Toaster<string> } = $props()
</script>

<ToastRegion {toaster}>
  <Toast>
    <ToastTitle />
    <ToastAction onAction={() => log("action")} />
  </Toast>
</ToastRegion>
