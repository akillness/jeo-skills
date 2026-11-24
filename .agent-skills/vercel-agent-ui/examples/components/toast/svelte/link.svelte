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

  const toast = createToaster()
  onDestroy(() => {
    toast.dismiss()
  })
</script>

<button
  onclick={() =>
    toast("Invoice sent", {
      description: "Hollis Grant · $240.00",
      action: { label: "View", href: "#" },
    })}
>
  Send Invoice
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
