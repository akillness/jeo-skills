<script setup lang="ts">
// A Close part's action reads the press's event and source, in a drawer as in a dialog.
import {
  Dialog,
  DialogClose,
  type DialogCloseActionDetails,
} from "../../src/dialog"
import { Drawer, DrawerClose } from "../../src/drawer"

const save = (
  _event: Event | undefined,
  { source }: DialogCloseActionDetails
) => source
</script>

<template>
  <Dialog><DialogClose @action="save">Save</DialogClose></Dialog>
  <Drawer><DrawerClose @action="save">Save</DrawerClose></Drawer>
</template>
