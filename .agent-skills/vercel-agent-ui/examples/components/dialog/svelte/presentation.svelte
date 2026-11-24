<script lang="ts">
  import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
  } from "@ui-sdk/svelte/dialog"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Input } from "@ui-sdk/svelte/input"
</script>

<Dialog presentation="sheet">
  <DialogTrigger>Edit Profile</DialogTrigger>
  <DialogContent>
    <div data-slot="stack">
      <DialogTitle>Edit profile</DialogTitle>
      <DialogDescription
        >Make changes to your profile here. Save when you're done.</DialogDescription
      >
    </div>
    <Field>
      <FieldLabel>Name</FieldLabel>
      <Input defaultValue="Hollis Grant" />
    </Field>
    <Field>
      <FieldLabel>Username</FieldLabel>
      <Input defaultValue="@hollis" />
    </Field>
    <div data-slot="row">
      <DialogClose>Cancel</DialogClose>
      <DialogClose data-variant="solid" value="save">Save Changes</DialogClose>
    </div>
  </DialogContent>
</Dialog>
