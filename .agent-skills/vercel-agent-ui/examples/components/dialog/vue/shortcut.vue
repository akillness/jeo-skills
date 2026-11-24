<script setup lang="ts">
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogShortcut,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/vue/dialog"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Input } from "@ui-sdk/vue/input"
import { PlusIcon } from "@lucide/vue"
</script>

<template>
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
          <button data-variant="solid" type="submit" value="save">
            Save Contact
          </button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
