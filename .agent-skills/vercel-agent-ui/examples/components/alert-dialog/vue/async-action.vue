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

let attempts = 0

async function deleteProject() {
  await new Promise((resolve) => setTimeout(resolve, 1200))
  if (attempts++ === 0) {
    throw new Error("Couldn't delete the project.")
  }
}
</script>

<template>
  <div data-slot="stack">
    <AlertDialog pending-announcement="Deleting project">
      <AlertDialogTrigger>Delete Project</AlertDialogTrigger>
      <AlertDialogBackdrop />
      <AlertDialogContent>
        <div data-slot="stack">
          <AlertDialogTitle>Delete project?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the project, its files and its deployment
            history for everyone on your team.
          </AlertDialogDescription>
        </div>
        <AlertDialogClose
          data-variant="solid"
          value="confirm"
          @action="deleteProject"
        >
          <template #render="{ props, state }">
            <div data-slot="stack">
              <p data-slot="hint" role="alert">
                {{ state.error instanceof Error ? state.error.message : "" }}
              </p>
              <div data-slot="row">
                <AlertDialogClose>Cancel</AlertDialogClose>
                <button v-bind="props">
                  {{
                    state.pending
                      ? "Deleting…"
                      : state.error
                        ? "Try Again"
                        : "Delete"
                  }}
                </button>
              </div>
            </div>
          </template>
        </AlertDialogClose>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
