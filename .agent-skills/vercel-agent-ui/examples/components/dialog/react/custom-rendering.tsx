import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogShortcut,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/react/dialog"

function Example() {
  return (
    <Dialog>
      <DialogTrigger
        shortcut="mod+i"
        render={(props, state) => (
          <button {...props}>
            {state.open ? "Viewing" : "View Details"}
            <DialogShortcut>{(shortcut) => shortcut.text}</DialogShortcut>
          </button>
        )}
      />
      <DialogBackdrop />
      <DialogContent>
        {(state) => (
          <>
            <div data-slot="stack">
              <DialogTitle render={<h3 />}>Details</DialogTitle>
              <DialogDescription>
                {state.nested
                  ? "Opened from another dialog."
                  : "Quarterly report, updated today."}
              </DialogDescription>
            </div>
            <div data-slot="row">
              <DialogClose>Close</DialogClose>
              <DialogClose
                data-variant="solid"
                render={<a href="https://example.com/details" />}
              >
                Open the Full Page
              </DialogClose>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export { Example }
