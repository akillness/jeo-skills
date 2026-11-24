import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@ui-sdk/solid/alert-dialog"

function Example() {
  return (
    <AlertDialog>
      <AlertDialogTrigger>Leave Workspace</AlertDialogTrigger>
      <AlertDialogBackdrop />
      <AlertDialogContent>
        <div data-slot="stack">
          <AlertDialogTitle>Leave this workspace?</AlertDialogTitle>
          <AlertDialogDescription>
            You'll lose access to its projects until someone invites you again.
          </AlertDialogDescription>
        </div>
        <div data-slot="row">
          <AlertDialogClose>Cancel</AlertDialogClose>
          <AlertDialogClose data-variant="solid" value="confirm">
            Leave
          </AlertDialogClose>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export { Example }
