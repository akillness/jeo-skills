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
import { useLog } from "../../../shared/vue/log"

const log = useLog()
</script>

<template>
  <Dialog
    @open-change-complete="
      (open: boolean) => log(open ? 'Finished opening' : 'Finished closing')
    "
  >
    <DialogTrigger>Slide In</DialogTrigger>
    <DialogBackdrop />
    <DialogContent keep-mounted>
      <div data-slot="stack">
        <DialogTitle>Slide and fade</DialogTitle>
        <DialogDescription
          >300ms in and out. Focus returns as soon as it starts
          closing.</DialogDescription
        >
      </div>
      <div data-slot="row">
        <DialogClose data-variant="solid">Close</DialogClose>
      </div>
    </DialogContent>
  </Dialog>
</template>
