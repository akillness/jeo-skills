import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/solid/dialog"
import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { Input } from "@ui-sdk/solid/input"

function Example() {
  return (
    <Dialog>
      <DialogTrigger>Share</DialogTrigger>
      <DialogBackdrop />
      <DialogContent>
        <div data-slot="stack">
          <DialogTitle>Share link</DialogTitle>
          <DialogDescription>
            Anyone who has this link will be able to view this.
          </DialogDescription>
        </div>
        <Field>
          <FieldLabel>Link</FieldLabel>
          <Input defaultValue="https://example.com/project" readonly />
        </Field>
        <div data-slot="row">
          <DialogClose data-variant="solid">Done</DialogClose>
        </div>
        <DialogClose aria-label="Close">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}

export { Example }
