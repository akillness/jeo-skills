<script setup lang="ts">
import {
  Toast,
  ToastAction,
  ToastDescription,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/vue/toast"
import { onUnmounted } from "vue"

const toast = createToaster()
onUnmounted(() => {
  toast.dismiss()
})

function sendInvoice() {
  toast("Invoice sent", {
    description: "Hollis Grant · $240.00",
    action: { label: "View", href: "#" },
  })
}
</script>

<template>
  <button @click="sendInvoice">Send Invoice</button>
  <ToastRegion :toaster="toast">
    <Toast>
      <div data-slot="stack">
        <ToastTitle />
        <ToastDescription />
      </div>
      <ToastAction data-variant="solid" />
    </Toast>
  </ToastRegion>
</template>
