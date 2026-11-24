<script lang="ts">
  import { onDestroy } from "svelte"
  import {
    CircleCheckIcon,
    InfoIcon,
    LoaderCircleIcon,
    OctagonXIcon,
    TriangleAlertIcon,
  } from "@lucide/svelte"
  import {
    Toast,
    ToastRegion,
    ToastTitle,
    createToaster,
  } from "@ui-sdk/svelte/toast"

  function upload() {
    return new Promise((resolve) => setTimeout(resolve, 2000))
  }

  const toast = createToaster()
  onDestroy(() => {
    toast.dismiss()
  })
</script>

<div data-slot="row">
  <button onclick={() => toast("Event created")}>Default</button>
  <button onclick={() => toast.success("Changes saved")}>Success</button>
  <button onclick={() => toast.info("A new version is available")}>Info</button>
  <button onclick={() => toast.warning("Storage is almost full")}
    >Warning</button
  >
  <button onclick={() => toast.error("Couldn't save changes")}>Error</button>
  <button
    onclick={() =>
      toast.promise(upload, {
        loading: "Uploading photos…",
        success: "Photos uploaded",
        error: "Upload failed",
      })}
  >
    Loading
  </button>
</div>
<ToastRegion toaster={toast}>
  <Toast>
    <CircleCheckIcon data-show="success" aria-hidden="true" />
    <InfoIcon data-show="info" aria-hidden="true" />
    <TriangleAlertIcon data-show="warning" aria-hidden="true" />
    <OctagonXIcon data-show="error" aria-hidden="true" />
    <LoaderCircleIcon data-show="loading" aria-hidden="true" />
    <ToastTitle />
  </Toast>
</ToastRegion>
