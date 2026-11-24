<script lang="ts">
  import { PlusIcon } from "@lucide/svelte"
  import {
    Dialog,
    DialogBackdrop,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogShortcut,
    DialogTitle,
    DialogTrigger,
  } from "@ui-sdk/svelte/dialog"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Input } from "@ui-sdk/svelte/input"
</script>

<Dialog>
  <DialogTrigger shortcut="mod+j">
    <PlusIcon aria-hidden="true" />
    New Contact
    <DialogShortcut />
  </DialogTrigger>
  <DialogBackdrop />
  <DialogContent>
    <div data-slot="stack">
      <DialogTitle>New contact</DialogTitle>
      <DialogDescription>Add someone to your address book.</DialogDescription>
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
        <button data-variant="solid" type="submit" value="save"
          >Save Contact</button
        >
      </div>
    </form>
  </DialogContent>
</Dialog>
