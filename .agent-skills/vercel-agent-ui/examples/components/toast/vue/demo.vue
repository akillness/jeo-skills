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
const toast = createToaster()
onUnmounted(() => {
  toast.dismiss()
})

function createEvent() {
  toast("Event created", {
    description: "Friday, June 12 at 10:00 AM",
    action: { label: "Undo", onAction: () => log("Event removed") },
  })
}
</script>

<template>
  <button @click="createEvent">Create Event</button>
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
