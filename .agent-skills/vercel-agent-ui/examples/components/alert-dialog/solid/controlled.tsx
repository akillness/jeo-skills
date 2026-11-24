import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@ui-sdk/solid/alert-dialog"
import { createSignal } from "solid-js"

function Example() {
  const [open, setOpen] = createSignal(false)

  return (
    <div data-slot="stack">
      <AlertDialog open={open()} onOpenChange={setOpen}>
        <AlertDialogTrigger>Review Changes</AlertDialogTrigger>
        <AlertDialogBackdrop />
        <AlertDialogContent>
          <div data-slot="stack">
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits will be lost if you leave without saving.
            </AlertDialogDescription>
          </div>
          <div data-slot="row">
            <AlertDialogClose>Keep Editing</AlertDialogClose>
            <AlertDialogClose data-variant="solid" value="confirm">
              Discard
            </AlertDialogClose>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export { Example }
