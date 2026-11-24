<script lang="ts">
  import {
    Dialog,
    DialogBackdrop,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
  } from "@ui-sdk/svelte/dialog"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<Dialog
  onOpenChangeComplete={(open) =>
    log(open ? "Finished opening" : "Finished closing")}
>
  <DialogTrigger>Slide In</DialogTrigger>
  <DialogBackdrop />
  <DialogContent keepMounted>
    <div data-slot="stack">
      <DialogTitle>Slide and fade</DialogTitle>
      <DialogDescription
        >300ms in and out. Focus returns as soon as it starts closing.</DialogDescription
      >
    </div>
    <div data-slot="row">
      <DialogClose data-variant="solid">Close</DialogClose>
    </div>
  </DialogContent>
</Dialog>
