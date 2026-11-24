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
  import { useLog } from "../../../shared/svelte/log"

  const confirm = createConfirm<{ name: string }>()
  const log = useLog()

  async function review() {
    const acme = confirm({ name: "Acme" })
    const globex = confirm({ name: "Globex" })
    const [first, second] = await Promise.all([acme, globex])
    log(`Acme: ${first ? "confirmed" : "canceled"}`)
    log(`Globex: ${second ? "confirmed" : "canceled"}`)
  }
</script>

<div data-slot="stack">
  <button type="button" onclick={review}>Review Two Projects</button>
  <AlertDialog controller={confirm.controller}>
    <AlertDialogBackdrop />
    <AlertDialogContent>
      {#snippet children(state: DialogContentState<{ name: string }>)}
        <div data-slot="stack">
          <AlertDialogTitle>Archive {state.payload?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Archived projects leave the active list. You can restore them later.
          </AlertDialogDescription>
        </div>
        <div data-slot="row">
          <AlertDialogClose>Cancel</AlertDialogClose>
          <AlertDialogClose data-variant="solid" value="confirm"
            >Archive</AlertDialogClose
          >
        </div>
      {/snippet}
    </AlertDialogContent>
  </AlertDialog>
</div>
