<script lang="ts">
  import {
    AlertDialog,
    AlertDialogBackdrop,
    AlertDialogClose,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    AlertDialogTrigger,
  } from "@ui-sdk/svelte/alert-dialog"

  let open = $state(false)
</script>

<div data-slot="stack">
  <AlertDialog bind:open>
    <AlertDialogTrigger>Review Changes</AlertDialogTrigger>
    <AlertDialogBackdrop />
    <AlertDialogContent>
      <div data-slot="stack">
        <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
        <AlertDialogDescription
          >Your edits will be lost if you leave without saving.</AlertDialogDescription
        >
      </div>
      <div data-slot="row">
        <AlertDialogClose>Keep Editing</AlertDialogClose>
        <AlertDialogClose data-variant="solid" value="confirm"
          >Discard</AlertDialogClose
        >
      </div>
    </AlertDialogContent>
  </AlertDialog>
</div>
