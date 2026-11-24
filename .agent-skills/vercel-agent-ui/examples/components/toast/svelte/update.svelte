<script lang="ts">
  import { onDestroy } from "svelte"
  import { CircleCheckIcon, LoaderCircleIcon } from "@lucide/svelte"
  import {
    Toast,
    ToastRegion,
    ToastTitle,
    createToaster,
  } from "@ui-sdk/svelte/toast"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  const toast = createToaster()
  let timer: ReturnType<typeof setInterval> | undefined
  onDestroy(() => {
    clearInterval(timer)
    toast.dismiss()
  })

  function upload() {
    clearInterval(timer)
    const id = toast.loading("Uploading report.pdf… 0%", { id: "upload" })
    let progress = 0
    timer = setInterval(() => {
      progress += 20
      const done = progress >= 100
      const open = toast.update(
        id,
        done
          ? { title: "Report uploaded", type: "success" }
          : { title: `Uploading report.pdf… ${progress}%` }
      )
      if (!open) {
        log("Upload canceled")
      }
      if (done || !open) {
        clearInterval(timer)
      }
    }, 700)
  }
</script>

<div data-slot="row">
  <button onclick={upload}>Upload Report</button>
  <button onclick={() => toast.dismiss("upload")}>Cancel Upload</button>
  <button onclick={() => toast.dismiss()}>Dismiss All</button>
</div>
<ToastRegion toaster={toast}>
  <Toast>
    <CircleCheckIcon data-show="success" aria-hidden="true" />
    <LoaderCircleIcon data-show="loading" aria-hidden="true" />
    <ToastTitle />
  </Toast>
</ToastRegion>
