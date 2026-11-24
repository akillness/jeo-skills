<script setup lang="ts">
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/vue/dialog"
</script>

<template>
  <div dir="rtl">
    <Dialog>
      <DialogTrigger>تعديل الملف الشخصي</DialogTrigger>
      <DialogBackdrop />
      <DialogContent>
        <div data-slot="stack">
          <DialogTitle>تعديل الملف الشخصي</DialogTitle>
          <DialogDescription
            >أجرِ التغييرات على ملفك الشخصي هنا.</DialogDescription
          >
        </div>
        <label data-slot="label">
          الاسم
          <input value="بيدرو دوارتي" />
        </label>
        <div data-slot="row">
          <DialogClose>إلغاء</DialogClose>
          <DialogClose data-variant="solid" value="save">حفظ</DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
