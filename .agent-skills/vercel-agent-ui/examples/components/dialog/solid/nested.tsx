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
      <DialogTrigger>Account</DialogTrigger>
      <DialogBackdrop />
      <DialogContent>
        <div data-slot="stack">
          <DialogTitle>Account</DialogTitle>
          <DialogDescription>Manage how you sign in.</DialogDescription>
        </div>
        <div data-slot="card">
          <div data-slot="stack">
            <span>Password</span>
            <span data-slot="hint">Last changed 3 months ago</span>
          </div>
          <Dialog>
            <DialogTrigger>Change Password</DialogTrigger>
            <DialogBackdrop />
            <DialogContent>
              <div data-slot="stack">
                <DialogTitle>Change password</DialogTitle>
                <DialogDescription>
                  Use at least 12 characters.
                </DialogDescription>
              </div>
              <Field>
                <FieldLabel>New password</FieldLabel>
                <Input type="password" />
              </Field>
              <div data-slot="row">
                <DialogClose>Cancel</DialogClose>
                <DialogClose data-variant="solid">Update</DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div data-slot="row">
          <DialogClose data-variant="solid">Done</DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { Example }
