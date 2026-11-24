<script setup lang="ts">
import {
  Toast,
  ToastAction,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/vue/toast"
import { onUnmounted } from "vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const toast = createToaster({ duration: 10000 })
onUnmounted(() => {
  toast.dismiss()
})

function sendMessage() {
  toast("Message sent", {
    action: { label: "Undo", onAction: () => log("Message unsent") },
  })
}
</script>

<template>
  <button @click="sendMessage">Send Message</button>
  <ToastRegion :toaster="toast" shortcut="alt+t" aria-label="Alerts">
    <Toast>
      <ToastTitle />
      <ToastAction data-variant="solid" />
    </Toast>
  </ToastRegion>
</template>
