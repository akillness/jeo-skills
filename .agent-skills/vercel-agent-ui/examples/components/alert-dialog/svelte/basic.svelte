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
</script>

<AlertDialog>
  <AlertDialogTrigger>Delete Project</AlertDialogTrigger>
  <AlertDialogBackdrop />
  <AlertDialogContent>
    <div data-slot="stack">
      <AlertDialogTitle>Delete this project?</AlertDialogTitle>
      <AlertDialogDescription>
        This permanently deletes the project, its files and its deployment
        history for everyone on your team.
      </AlertDialogDescription>
    </div>
    <div data-slot="row">
      <AlertDialogClose>Cancel</AlertDialogClose>
      <AlertDialogClose data-variant="solid" value="confirm"
        >Delete</AlertDialogClose
      >
    </div>
  </AlertDialogContent>
</AlertDialog>
