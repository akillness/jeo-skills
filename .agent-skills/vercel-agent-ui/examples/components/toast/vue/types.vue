<script setup lang="ts">
import {
  CircleCheckIcon,
  InfoIcon,
  LoaderCircleIcon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "@lucide/vue"
import {
  Toast,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/vue/toast"
import { onUnmounted } from "vue"

const toast = createToaster()
onUnmounted(() => {
  toast.dismiss()
})

function upload() {
  return new Promise((resolve) => setTimeout(resolve, 2000))
}

function uploadPhotos() {
  toast.promise(upload, {
    loading: "Uploading photos…",
    success: "Photos uploaded",
    error: "Upload failed",
  })
}
</script>

<template>
  <div data-slot="row">
    <button @click="toast('Event created')">Default</button>
    <button @click="toast.success('Changes saved')">Success</button>
    <button @click="toast.info('A new version is available')">Info</button>
    <button @click="toast.warning('Storage is almost full')">Warning</button>
    <button @click="toast.error(`Couldn't save changes`)">Error</button>
    <button @click="uploadPhotos">Loading</button>
  </div>
  <ToastRegion :toaster="toast">
    <Toast>
      <CircleCheckIcon data-show="success" aria-hidden="true" />
      <InfoIcon data-show="info" aria-hidden="true" />
      <TriangleAlertIcon data-show="warning" aria-hidden="true" />
      <OctagonXIcon data-show="error" aria-hidden="true" />
      <LoaderCircleIcon data-show="loading" aria-hidden="true" />
      <ToastTitle />
    </Toast>
  </ToastRegion>
</template>
