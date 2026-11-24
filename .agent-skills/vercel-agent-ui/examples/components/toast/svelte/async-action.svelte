<script lang="ts">
  import { onDestroy } from "svelte"
  import {
    Toast,
    ToastAction,
    ToastDescription,
    ToastRegion,
    ToastTitle,
    createToaster,
  } from "@ui-sdk/svelte/toast"
  import { useLog } from "../../../shared/svelte/log"

  function restore() {
    return new Promise((resolve) => setTimeout(resolve, 1500))
  }

  const log = useLog()
  const toast = createToaster({ duration: 6000 })
  onDestroy(() => {
    toast.dismiss()
  })
</script>

<button
  onclick={() =>
    toast("File deleted", {
      description: "Q3 report.pdf",
      action: {
        label: "Undo",
        onAction: async () => {
          await restore()
          log("Q3 report.pdf restored")
        },
      },
    })}
>
  Delete File
</button>
<ToastRegion toaster={toast}>
  <Toast>
    <div data-slot="stack">
      <ToastTitle />
      <ToastDescription />
    </div>
    <ToastAction data-variant="solid">
      {#snippet children(state)}
        {state.pending ? "Restoring…" : state.error ? "Retry" : "Undo"}
      {/snippet}
    </ToastAction>
  </Toast>
</ToastRegion>
