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
  <div dir="rtl">
    <button
      @click="
        toast('تم إنشاء الحدث', {
          description: 'الأحد 3 ديسمبر الساعة 9:00 صباحًا',
        })
      "
    >
      إظهار الإشعار
    </button>
    <ToastRegion :toaster="toast">
      <Toast>
        <div data-slot="stack">
          <ToastTitle />
          <ToastDescription />
        </div>
      </Toast>
    </ToastRegion>
  </div>
</template>
