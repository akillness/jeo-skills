<script setup lang="ts">
import {
  Toast,
  ToastAction,
  ToastClose,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/vue/toast"
import { onUnmounted } from "vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const toast = createToaster()
onUnmounted(() => {
  toast.dismiss()
})

function archive() {
  toast("Message archived", {
    action: { label: "Undo", onAction: () => log("Message restored") },
    cancel: { label: "Dismiss", onCancel: () => log("Kept archived") },
    onDismiss: ({ reason }) => log(`Closed (${reason})`),
  })
}
</script>

<template>
  <button @click="archive">Archive Message</button>
  <ToastRegion :toaster="toast">
    <template #default="{ toast: item }">
      <Toast>
        <ToastTitle />
        <ToastClose v-if="item.cancel" :action="item.cancel.onCancel">{{
          item.cancel.label
        }}</ToastClose>
        <ToastAction data-variant="solid" />
      </Toast>
    </template>
  </ToastRegion>
</template>
