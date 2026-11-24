<script lang="ts">
  import { createDialogController } from "@ui-sdk/core/dialog"
  import {
    AlertDialog,
    AlertDialogClose,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
  } from "../../src/alert-dialog"
  import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogShortcut,
    DialogTitle,
    DialogTrigger,
  } from "../../src/dialog"

  let {
    open = false,
    remote = false,
    alert = false,
    presentation,
  }: {
    open?: boolean
    remote?: boolean
    alert?: boolean
    presentation?: "auto" | "dialog" | "sheet"
  } = $props()

  const search = createDialogController()
</script>

{#if alert}
  <AlertDialog defaultOpen>
    <AlertDialogContent>
      <AlertDialogTitle>Delete?</AlertDialogTitle>
      <AlertDialogDescription>It can't be undone.</AlertDialogDescription>
      <AlertDialogClose>Cancel</AlertDialogClose>
    </AlertDialogContent>
  </AlertDialog>
{:else if remote}
  <DialogTrigger controller={search} shortcut="mod+k"
    >Search<DialogShortcut /></DialogTrigger
  >
  <Dialog controller={search}
    ><DialogContent><DialogTitle>Search</DialogTitle></DialogContent></Dialog
  >
{:else}
  <Dialog defaultOpen={open} {presentation}>
    <DialogTrigger shortcut="mod+k"
      >Edit profile<DialogShortcut /></DialogTrigger
    >
    <DialogContent>
      <DialogTitle>Profile settings</DialogTitle>
      <DialogDescription>Make changes to your profile.</DialogDescription>
      <DialogClose>Close</DialogClose>
    </DialogContent>
  </Dialog>
{/if}
