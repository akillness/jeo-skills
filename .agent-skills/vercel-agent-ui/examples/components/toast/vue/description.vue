<script setup lang="ts">
import {
  Toast,
  ToastDescription,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/vue/toast"

const toast = createToaster()
</script>

<template>
  <button
    @click="
      toast({
        title: 'Event has been created',
        description: 'Monday, January 3rd at 6:00pm',
      })
    "
  >
    Show toast
  </button>
  <ToastRegion :toaster="toast">
    <Toast>
      <div data-slot="stack">
        <ToastTitle />
        <ToastDescription />
      </div>
    </Toast>
  </ToastRegion>
</template>
