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

  const log = useLog()
  const toast = createToaster()
  onDestroy(() => {
    toast.dismiss()
  })
</script>

<button
  onclick={() =>
    toast("Event created", {
      description: "Friday, June 12 at 10:00 AM",
      action: { label: "Undo", onAction: () => log("Event removed") },
    })}
>
  Create Event
</button>
<ToastRegion toaster={toast}>
  <Toast>
    <div data-slot="stack">
      <ToastTitle />
      <ToastDescription />
    </div>
    <ToastAction data-variant="solid" />
  </Toast>
</ToastRegion>
