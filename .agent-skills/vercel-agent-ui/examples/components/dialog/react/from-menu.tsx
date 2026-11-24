"use client"

import * as React from "react"
import {
  createDialogController,
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ui-sdk/react/dialog"
import { Field, FieldLabel } from "@ui-sdk/react/field"
import { Input } from "@ui-sdk/react/input"
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@ui-sdk/react/menu"
import { CopyIcon, EllipsisIcon, PencilIcon } from "lucide-react"

function Example() {
  const [rename] = React.useState(() => createDialogController())
  return (
    <>
      <Menu>
        <MenuTrigger aria-label="File actions">
          <EllipsisIcon aria-hidden="true" />
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={() => rename.open()}>
            <PencilIcon aria-hidden="true" />
            Rename…
          </MenuItem>
          <MenuItem>
            <CopyIcon aria-hidden="true" />
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
