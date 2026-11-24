<script setup lang="ts">
import { AlertDialog } from "../../src/alert-dialog"
import { Dialog } from "../../src/dialog"
import { Drawer } from "../../src/drawer"
</script>

<template>
  <Dialog pending-announcement="Saving changes" />
  <AlertDialog pending-announcement="Deleting item" />
  <Drawer pending-announcement="Saving changes" />
  <!-- @vue-expect-error The pending announcement is text. -->
  <Dialog :pending-announcement="1" />
  <!-- @vue-expect-error The pending announcement is text. -->
  <AlertDialog :pending-announcement="1" />
</template>
