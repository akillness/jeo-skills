<script lang="ts">
  import { onDestroy } from "svelte"
  import { CircleCheckIcon } from "@lucide/svelte"
  import {
    AlertDialog,
    AlertDialogBackdrop,
    AlertDialogClose,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    createConfirm,
    type ConfirmOptions,
  } from "@ui-sdk/svelte/alert-dialog"
  import type { DialogContentState } from "@ui-sdk/svelte/dialog"
  import { OverlayHost, createOverlays } from "@ui-sdk/svelte/overlays"
  import { Toast, ToastTitle, createToaster } from "@ui-sdk/svelte/toast"

  const overlays = createOverlays()
  const toast = createToaster({ overlays })
  const confirm = createConfirm({ overlays })
  let projects = $state(["Acme", "Globex", "Initech"])
  let reset: HTMLButtonElement
  onDestroy(() => {
    toast.dismiss()
  })

  async function remove(name: string, button: HTMLButtonElement) {
    const confirmed = await confirm({
      title: `Delete ${name}?`,
      description:
        "The project and its files will be deleted for everyone on your team.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
    })
    if (!confirmed) {
      return
    }
    const row = button.closest("li")
    const next = (
      row?.nextElementSibling ?? row?.previousElementSibling
    )?.querySelector("button")
    ;(next ?? reset)?.focus()
    projects = projects.filter((project) => project !== name)
    toast.success(`${name} deleted`, { priority: "assertive" })
  }
</script>

{#snippet toastItem()}
  <Toast>
    <CircleCheckIcon data-show="success" aria-hidden="true" />
    <ToastTitle />
  </Toast>
{/snippet}

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
  <OverlayHost {overlays} toast={{ children: toastItem }} />
  <AlertDialog controller={confirm.controller}>
    <AlertDialogBackdrop />
    <AlertDialogContent>
      {#snippet children(state: DialogContentState<ConfirmOptions>)}
        <div data-slot="stack">
          <AlertDialogTitle>{state.payload?.title}</AlertDialogTitle>
          <AlertDialogDescription
            >{state.payload?.description}</AlertDialogDescription
          >
        </div>
        <div data-slot="row">
          <AlertDialogClose>{state.payload?.cancelLabel}</AlertDialogClose>
          <AlertDialogClose data-variant="solid" value="confirm">
            {state.payload?.confirmLabel}
          </AlertDialogClose>
        </div>
      {/snippet}
    </AlertDialogContent>
  </AlertDialog>
</div>
