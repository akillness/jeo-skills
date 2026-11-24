import {
  createDialogController,
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ui-sdk/solid/dialog"
import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { Input } from "@ui-sdk/solid/input"
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@ui-sdk/solid/menu"

function Example() {
  const rename = createDialogController()
  return (
    <>
      <Menu>
        <MenuTrigger aria-label="File actions">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
            <circle cx="5" cy="12" r="1" />
          </svg>
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={() => rename.open()}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
              <path d="m15 5 4 4" />
            </svg>
            Rename…
          </MenuItem>
          <MenuItem>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
            </svg>
            Duplicate
          </MenuItem>
        </MenuContent>
      </Menu>
      <Dialog controller={rename}>
        <DialogBackdrop />
        <DialogContent>
          <div data-slot="stack">
            <DialogTitle>Rename file</DialogTitle>
            <DialogDescription>
              Names must be unique in a folder.
            </DialogDescription>
          </div>
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input defaultValue="report.pdf" />
          </Field>
          <div data-slot="row">
            <DialogClose>Cancel</DialogClose>
            <DialogClose data-variant="solid" value="rename">
              Rename
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export { Example }
