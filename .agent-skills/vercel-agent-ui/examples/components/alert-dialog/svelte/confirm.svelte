<script lang="ts">
  import {
    AlertDialog,
    AlertDialogBackdrop,
    AlertDialogClose,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    createConfirm,
  } from "@ui-sdk/svelte/alert-dialog"
  import type { DialogContentState } from "@ui-sdk/svelte/dialog"

  const confirm = createConfirm<{ name: string }>()
  let projects = $state(["Acme", "Globex", "Initech"])
  let reset: HTMLButtonElement

  async function remove(name: string, button: HTMLButtonElement) {
    if (!(await confirm({ name }))) {
      return
    }
    const row = button.closest("li")
    const next = (
      row?.nextElementSibling ?? row?.previousElementSibling
    )?.querySelector("button")
    const target = next ?? reset
    target?.focus()
    projects = projects.filter((project) => project !== name)
  }
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button
      type="button"
      bind:this={reset}
      onclick={() => (projects = ["Acme", "Globex", "Initech"])}
    >
      Reset Projects
    </button>
  </div>
  <ul data-slot="list" aria-label="Projects">
    {#each projects as name (name)}
      <li data-slot="row">
        {name}
        <button
          type="button"
          data-size="sm"
          aria-label={`Delete ${name}`}
          onclick={(event) => remove(name, event.currentTarget)}
        >
          Delete
        </button>
      </li>
    {:else}
      <li data-slot="row">All projects deleted.</li>
    {/each}
  </ul>
  <AlertDialog controller={confirm.controller}>
    <AlertDialogBackdrop />
    <AlertDialogContent>
      {#snippet children(state: DialogContentState<{ name: string }>)}
        <div data-slot="stack">
          <AlertDialogTitle>Delete {state.payload?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            The project and its files will be deleted for everyone on your team.
          </AlertDialogDescription>
        </div>
        <div data-slot="row">
          <AlertDialogClose>Cancel</AlertDialogClose>
          <AlertDialogClose data-variant="solid" value="confirm"
            >Delete</AlertDialogClose
          >
        </div>
      {/snippet}
    </AlertDialogContent>
  </AlertDialog>
</div>
