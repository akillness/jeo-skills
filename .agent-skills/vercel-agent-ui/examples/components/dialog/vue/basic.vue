<script setup lang="ts">
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/vue/dialog"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Input } from "@ui-sdk/vue/input"
import { XIcon } from "@lucide/vue"
</script>

<template>
  <Dialog>
    <DialogTrigger>Share</DialogTrigger>
    <DialogBackdrop />
    <DialogContent>
      <div data-slot="stack">
        <DialogTitle>Share link</DialogTitle>
        <DialogDescription
          >Anyone who has this link will be able to view
          this.</DialogDescription
        >
      </div>
      <Field>
        <FieldLabel>Link</FieldLabel>
        <Input defaultValue="https://example.com/project" readonly />
      </Field>
      <div data-slot="row">
        <DialogClose data-variant="solid">Done</DialogClose>
      </div>
      <DialogClose aria-label="Close">
        <XIcon aria-hidden="true" />
      </DialogClose>
    </DialogContent>
  </Dialog>
</template>
