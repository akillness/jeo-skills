<script setup lang="ts">
import { XIcon } from "@lucide/vue"
import {
  Toast,
  ToastAction,
  ToastClose,
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

function newMessage() {
  toast({
    title: "Hollis Grant",
    description: "Can you review the draft?",
    data: { initials: "HG" },
    action: { label: "Reply", onAction: () => log("Replying to Hollis Grant") },
  })
}
</script>

<template>
  <button @click="newMessage">New Message</button>
  <ToastRegion :toaster="toast" aria-label="Messages">
    <template #default="{ toast: item }">
      <Toast>
        <template #render="{ props, state, children }">
          <li
            v-bind="props"
            :inert="
              state.leaving || (!state.expanded && state.index > 0) || undefined
            "
          >
            <component :is="children" />
          </li>
        </template>
        <template #default>
          <span data-slot="media">{{
            (item.data as { initials: string }).initials
          }}</span>
          <div data-slot="stack">
            <ToastTitle />
            <ToastDescription />
          </div>
          <ToastAction data-variant="solid" />
          <ToastClose aria-label="Close">
            <XIcon aria-hidden="true" />
          </ToastClose>
        </template>
      </Toast>
    </template>
  </ToastRegion>
</template>
