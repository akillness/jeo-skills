import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/solid/dialog"

function Example() {
  return (
    <div data-slot="dialog-frame">
      <Dialog modal="trap-focus" closeOnOutsidePress={false}>
        <DialogTrigger>Delete Draft</DialogTrigger>
        <DialogBackdrop />
        <DialogContent inline>
          <div data-slot="stack">
            <DialogTitle>Delete this draft?</DialogTitle>
            <DialogDescription>
              The preview keeps its dialog inside the frame.
            </DialogDescription>
          </div>
          <div data-slot="row">
            <DialogClose>Cancel</DialogClose>
            <DialogClose data-variant="destructive">Delete</DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { Example }
