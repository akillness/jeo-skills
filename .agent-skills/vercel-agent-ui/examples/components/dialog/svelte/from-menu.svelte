<script lang="ts">
  import { CopyIcon, EllipsisIcon, PencilIcon } from "@lucide/svelte"
  import {
    createDialogController,
    Dialog,
    DialogBackdrop,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogTitle,
  } from "@ui-sdk/svelte/dialog"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Input } from "@ui-sdk/svelte/input"
  import { Menu, MenuContent, MenuItem, MenuTrigger } from "@ui-sdk/svelte/menu"

  const rename = createDialogController()
</script>

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
      <DialogDescription>Names must be unique in a folder.</DialogDescription>
    </div>
    <Field>
      <FieldLabel>Name</FieldLabel>
      <Input defaultValue="report.pdf" />
    </Field>
    <div data-slot="row">
      <DialogClose>Cancel</DialogClose>
      <DialogClose data-variant="solid" value="rename">Rename</DialogClose>
    </div>
  </DialogContent>
</Dialog>
