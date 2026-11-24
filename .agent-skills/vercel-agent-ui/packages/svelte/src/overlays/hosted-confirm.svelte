<script lang="ts">
  import type { ConfirmEntry, ConfirmOptions } from "@ui-sdk/core/dialog"
  import { onMount } from "svelte"
  import {
    AlertDialog,
    AlertDialogClose,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
  } from "../alert-dialog"

  // The alert dialog the host renders for a `confirm()` question.
  let { entry }: { entry: ConfirmEntry } = $props()

  // The alert dialog attached the controller as it mounted, so it can open now.
  onMount(() => entry.open())
  const question = $derived((entry.payload ?? {}) as Partial<ConfirmOptions>)
</script>

<AlertDialog
  controller={entry.controller}
  onOpenChangeComplete={(open) => !open && entry.done()}
>
  <AlertDialogContent>
    <AlertDialogTitle>{question.title}</AlertDialogTitle>
    {#if question.description}
      <AlertDialogDescription>{question.description}</AlertDialogDescription>
    {/if}
    <div>
      <AlertDialogClose>{question.cancelLabel ?? "Cancel"}</AlertDialogClose>
      <AlertDialogClose value="confirm">
        {question.confirmLabel ?? "Continue"}
      </AlertDialogClose>
    </div>
  </AlertDialogContent>
</AlertDialog>
