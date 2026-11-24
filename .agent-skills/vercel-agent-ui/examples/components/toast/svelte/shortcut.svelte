<script lang="ts">
  import { onDestroy } from "svelte"
  import {
    Toast,
    ToastAction,
    ToastRegion,
    ToastTitle,
    createToaster,
  } from "@ui-sdk/svelte/toast"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  const toast = createToaster({ duration: 10000 })
  onDestroy(() => {
    toast.dismiss()
  })
</script>

<button
  onclick={() =>
    toast("Message sent", {
      action: { label: "Undo", onAction: () => log("Message unsent") },
    })}
>
  Send Message
</button>
<ToastRegion toaster={toast} shortcut="alt+t" aria-label="Alerts">
  <Toast>
    <ToastTitle />
    <ToastAction data-variant="solid" />
  </Toast>
</ToastRegion>
