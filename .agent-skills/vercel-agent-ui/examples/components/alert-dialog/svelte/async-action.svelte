<script lang="ts">
  import {
    AlertDialog,
    AlertDialogBackdrop,
    AlertDialogClose,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    AlertDialogTrigger,
  } from "@ui-sdk/svelte/alert-dialog"

  let attempts = 0

  async function deleteProject() {
    await new Promise((resolve) => setTimeout(resolve, 1200))
    if (attempts++ === 0) {
      throw new Error("Couldn't delete the project.")
    }
  }
</script>

<div data-slot="stack">
  <AlertDialog pendingAnnouncement="Deleting project">
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
        action={deleteProject}
      >
        {#snippet render({ props, state })}
          <div data-slot="stack">
            <p data-slot="hint" role="alert">
              {state.error instanceof Error ? state.error.message : ""}
            </p>
            <div data-slot="row">
              <AlertDialogClose>Cancel</AlertDialogClose>
              <button {...props}
                >{state.pending
                  ? "Deleting…"
                  : state.error
                    ? "Try Again"
                    : "Delete"}</button
              >
            </div>
          </div>
        {/snippet}
      </AlertDialogClose>
    </AlertDialogContent>
  </AlertDialog>
</div>
