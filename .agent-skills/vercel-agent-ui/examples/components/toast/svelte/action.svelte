<script lang="ts">
  import { onDestroy } from "svelte"
  import {
    Toast,
    ToastAction,
    ToastClose,
    ToastRegion,
    ToastTitle,
    createToaster,
  } from "@ui-sdk/svelte/toast"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  const toast = createToaster()
  onDestroy(() => {
    toast.dismiss()
  })
</script>

<button
  onclick={() =>
    toast("Message archived", {
      action: { label: "Undo", onAction: () => log("Message restored") },
      cancel: { label: "Dismiss", onCancel: () => log("Kept archived") },
      onDismiss: ({ reason }) => log(`Closed (${reason})`),
    })}
>
  Archive Message
</button>
<ToastRegion toaster={toast}>
  {#snippet children(item)}
    <Toast>
      <ToastTitle />
      {#if item.cancel}
        <ToastClose action={item.cancel.onCancel}
          >{item.cancel.label}</ToastClose
        >
      {/if}
      <ToastAction data-variant="solid" />
    </Toast>
  {/snippet}
</ToastRegion>
