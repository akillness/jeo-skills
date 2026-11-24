<script lang="ts">
  import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogTitle,
    type DialogCloseActionDetails,
  } from "../../src/dialog"
  import { ToastRegion, type Toaster } from "../../src/toast"

  let {
    log,
    toaster,
  }: { log: (entry: string) => void; toaster: Toaster<string> } = $props()

  const save = (
    _event: Event | undefined,
    { source }: DialogCloseActionDetails
  ) => log(`save:${source}`)
</script>

<Dialog defaultOpen>
  <DialogContent>
    <DialogTitle>Draft</DialogTitle>
    <DialogClose action={save}>Save</DialogClose>
  </DialogContent>
</Dialog>
<ToastRegion {toaster} />
