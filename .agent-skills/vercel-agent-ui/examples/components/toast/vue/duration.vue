<script setup lang="ts">
import {
  Toast,
  ToastClose,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/vue/toast"
import { onUnmounted } from "vue"

const toast = createToaster()
onUnmounted(() => {
  toast.dismiss()
})

function untilDismissed() {
  toast("Your session expires in 5 minutes", {
    duration: Infinity,
    dismissible: false,
    cancel: { label: "Got It" },
  })
}
</script>

<template>
  <div data-slot="row">
    <button @click="toast('Link copied', { duration: 1000 })">1 Second</button>
    <button @click="toast('Changes saved')">5 Seconds</button>
    <button @click="untilDismissed">Until Dismissed</button>
  </div>
  <ToastRegion :toaster="toast">
    <template #default="{ toast: item }">
      <Toast>
        <ToastTitle />
        <ToastClose
          v-if="item.cancel"
          data-variant="solid"
          :action="item.cancel.onCancel"
        >
          {{ item.cancel.label }}
        </ToastClose>
      </Toast>
    </template>
  </ToastRegion>
</template>
