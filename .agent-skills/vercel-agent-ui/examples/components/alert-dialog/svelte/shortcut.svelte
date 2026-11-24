<script lang="ts">
  import {
    AlertDialog,
    AlertDialogBackdrop,
    AlertDialogClose,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogShortcut,
    AlertDialogTitle,
    AlertDialogTrigger,
  } from "@ui-sdk/svelte/alert-dialog"
</script>

<AlertDialog>
  <AlertDialogTrigger shortcut="mod+shift+h">
    Clear History
    <AlertDialogShortcut />
  </AlertDialogTrigger>
  <AlertDialogBackdrop />
  <AlertDialogContent>
    <div data-slot="stack">
      <AlertDialogTitle>Clear your history?</AlertDialogTitle>
      <AlertDialogDescription>
        Recent searches and visited pages are removed from this device.
      </AlertDialogDescription>
    </div>
    <div data-slot="row">
      <AlertDialogClose>Cancel</AlertDialogClose>
      <AlertDialogClose data-variant="solid" value="confirm"
        >Clear</AlertDialogClose
      >
    </div>
  </AlertDialogContent>
</AlertDialog>
