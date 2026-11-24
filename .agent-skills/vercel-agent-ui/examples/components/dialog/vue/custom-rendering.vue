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
</script>

<template>
  <Dialog>
    <DialogTrigger shortcut="mod+i">
      <template #render="{ props, state }">
        <button v-bind="props">
          {{ state.open ? "Viewing" : "View Details" }}
          <DialogShortcut v-slot="{ state: shortcut }">{{
            shortcut.text
          }}</DialogShortcut>
        </button>
      </template>
    </DialogTrigger>
    <DialogBackdrop />
    <DialogContent v-slot="{ state }">
      <div data-slot="stack">
        <DialogTitle>
          <template #render="{ props }">
            <h3 v-bind="props">Details</h3>
          </template>
        </DialogTitle>
        <DialogDescription>
          {{
            state.nested
              ? "Opened from another dialog."
              : "Quarterly report, updated today."
          }}
        </DialogDescription>
      </div>
      <div data-slot="row">
        <DialogClose>Close</DialogClose>
        <DialogClose data-variant="solid" href="https://example.com/details">
          <template #render="{ props }">
            <a v-bind="props">Open the Full Page</a>
          </template>
        </DialogClose>
      </div>
    </DialogContent>
  </Dialog>
</template>
