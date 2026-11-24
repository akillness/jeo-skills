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
    <AlertDialog open={open()} onOpenChange={setOpen}>
      <AlertDialogTrigger>Delete Workspace</AlertDialogTrigger>
      <AlertDialogBackdrop />
      <AlertDialogContent>
        <div data-slot="stack">
          <AlertDialogTitle>Delete this workspace?</AlertDialogTitle>
          <AlertDialogDescription>
            All 12 projects and their deployments will be deleted for everyone
            on your team.
          </AlertDialogDescription>
        </div>
        <div data-slot="row">
          <AlertDialogClose>Cancel</AlertDialogClose>
          <AlertDialog
            onOpenChange={(nested, details) => {
              if (!nested && details.returnValue === "confirm") {
                setOpen(false)
              }
            }}
          >
            <AlertDialogTrigger data-variant="solid">Delete</AlertDialogTrigger>
            <AlertDialogBackdrop />
            <AlertDialogContent>
              <div data-slot="stack">
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  There's no way to get the workspace back.
                </AlertDialogDescription>
              </div>
              <div data-slot="row">
                <AlertDialogClose>Go Back</AlertDialogClose>
                <AlertDialogClose data-variant="solid" value="confirm">
                  Delete Workspace
                </AlertDialogClose>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export { Example }
