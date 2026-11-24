import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogShortcut,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/solid/dialog"
import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { Input } from "@ui-sdk/solid/input"

function Example() {
  return (
    <Dialog>
      <DialogTrigger shortcut="mod+j">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </svg>
        New Contact
        <DialogShortcut />
      </DialogTrigger>
      <DialogBackdrop />
      <DialogContent>
        <div data-slot="stack">
          <DialogTitle>New contact</DialogTitle>
          <DialogDescription>
            Add someone to your address book.
          </DialogDescription>
        </div>
        <form data-slot="stack" method="dialog">
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input name="name" required placeholder="Kofi Mensah" />
          </Field>
          <Field>
            <FieldLabel>Email</FieldLabel>
            <Input
              name="email"
              type="email"
              required
              placeholder="kofi@example.com"
            />
          </Field>
          <div data-slot="row">
            <DialogClose>Cancel</DialogClose>
            <button data-variant="solid" type="submit" value="save">
              Save Contact
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { Example }
