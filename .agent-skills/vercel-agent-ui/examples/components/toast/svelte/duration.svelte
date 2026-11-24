<script lang="ts">
  import { onDestroy } from "svelte"
  import {
    Toast,
    ToastClose,
    ToastRegion,
    ToastTitle,
    createToaster,
  } from "@ui-sdk/svelte/toast"

  const toast = createToaster()
  onDestroy(() => {
    toast.dismiss()
  })
</script>

<div data-slot="row">
  <button onclick={() => toast("Link copied", { duration: 1000 })}
    >1 Second</button
  >
  <button onclick={() => toast("Changes saved")}>5 Seconds</button>
  <button
    onclick={() =>
      toast("Your session expires in 5 minutes", {
        duration: Infinity,
        dismissible: false,
        cancel: { label: "Got It" },
      })}
  >
    Until Dismissed
  </button>
</div>
<ToastRegion toaster={toast}>
  {#snippet children(item)}
    <Toast>
      <ToastTitle />
      {#if item.cancel}
        <ToastClose data-variant="solid" action={item.cancel.onCancel}>
          {item.cancel.label}
        </ToastClose>
      {/if}
    </Toast>
  {/snippet}
</ToastRegion>
