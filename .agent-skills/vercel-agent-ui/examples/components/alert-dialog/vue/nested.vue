<script setup lang="ts">
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@ui-sdk/vue/alert-dialog"
import { ref } from "vue"

const open = ref(false)

function onNestedOpenChange(
  nested: boolean,
  details: { returnValue?: string }
) {
  if (!nested && details.returnValue === "confirm") {
    open.value = false
  }
}
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogTrigger>Delete Workspace</AlertDialogTrigger>
    <AlertDialogBackdrop />
    <AlertDialogContent>
      <div data-slot="stack">
        <AlertDialogTitle>Delete this workspace?</AlertDialogTitle>
        <AlertDialogDescription>
          All 12 projects and their deployments will be deleted for everyone on
          your team.
        </AlertDialogDescription>
      </div>
      <div data-slot="row">
        <AlertDialogClose>Cancel</AlertDialogClose>
        <AlertDialog @open-change="onNestedOpenChange">
          <AlertDialogTrigger data-variant="solid">Delete</AlertDialogTrigger>
          <AlertDialogBackdrop />
          <AlertDialogContent>
            <div data-slot="stack">
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription
                >There's no way to get the workspace
                back.</AlertDialogDescription
              >
            </div>
            <div data-slot="row">
              <AlertDialogClose>Go Back</AlertDialogClose>
              <AlertDialogClose data-variant="solid" value="confirm"
                >Delete Workspace</AlertDialogClose
              >
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AlertDialogContent>
  </AlertDialog>
</template>
