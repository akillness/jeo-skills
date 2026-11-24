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
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const toast = createToaster({ duration: 6000 })
onUnmounted(() => {
  toast.dismiss()
})

function restore() {
  return new Promise((resolve) => setTimeout(resolve, 1500))
}

function deleteFile() {
  toast("File deleted", {
    description: "Q3 report.pdf",
    action: {
      label: "Undo",
      onAction: async () => {
        await restore()
        log("Q3 report.pdf restored")
      },
    },
  })
}
</script>

<template>
  <button @click="deleteFile">Delete File</button>
  <ToastRegion :toaster="toast">
    <Toast>
      <div data-slot="stack">
        <ToastTitle />
        <ToastDescription />
      </div>
      <ToastAction v-slot="{ state }" data-variant="solid">
        {{ state.pending ? "Restoring…" : state.error ? "Retry" : "Undo" }}
      </ToastAction>
    </Toast>
  </ToastRegion>
</template>
