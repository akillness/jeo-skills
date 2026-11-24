<script setup lang="ts">
import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@ui-sdk/vue/resizable"
</script>

<template>
  <div dir="rtl">
    <Resizable>
      <ResizablePanel :default-size="35" :min-size="20">
        <h3>الملفات</h3>
        <ul>
          <li>page.tsx</li>
          <li>layout.tsx</li>
          <li>globals.css</li>
        </ul>
      </ResizablePanel>
      <ResizableHandle aria-label="تغيير حجم الملفات" />
      <ResizablePanel :default-size="65" :min-size="40">
        <Resizable orientation="vertical">
          <ResizablePanel :default-size="60" :min-size="30">
            <h3>page.tsx</h3>
            <span data-slot="hint">حُفظ للتو</span>
          </ResizablePanel>
          <ResizableHandle aria-label="تغيير حجم المحرر" />
          <ResizablePanel :default-size="40" :min-size="30">
            <h3>الطرفية</h3>
            <span data-slot="hint">جاهز على المنفذ 3000</span>
          </ResizablePanel>
        </Resizable>
      </ResizablePanel>
    </Resizable>
  </div>
</template>
