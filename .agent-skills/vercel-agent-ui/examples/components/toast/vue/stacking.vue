<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/vue/checkbox"
import {
  Toast,
  ToastDescription,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/vue/toast"
import { onUnmounted, ref } from "vue"

const notifications = [
  { title: "Event created", description: "Friday, June 12 at 10:00 AM" },
  { title: "Message sent" },
  {
    title: "Hollis Grant joined",
    description: "They can now edit the Launch plan and see its comments.",
  },
  { title: "Changes saved" },
  { title: "Invoice sent", description: "Inès Moreau · $240.00" },
  { title: "Photos uploaded", description: "12 photos added to Summer trip" },
]

const toast = createToaster()
const expanded = ref(false)
let count = 0
onUnmounted(() => {
  toast.dismiss()
})
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <label data-slot="label">
        <Checkbox
          :checked="expanded"
          @checked-change="(next) => (expanded = next === true)"
        >
          <CheckboxIndicator>
            <CheckIcon aria-hidden="true" />
          </CheckboxIndicator>
        </Checkbox>
        Always expanded
      </label>
    </div>
    <button @click="toast(notifications[count++ % notifications.length])">
      Add Toast
    </button>
    <ToastRegion :toaster="toast" :max-visible="4" :expanded="expanded">
      <Toast>
        <div data-slot="stack">
          <ToastTitle />
          <ToastDescription />
        </div>
      </Toast>
    </ToastRegion>
  </div>
</template>
