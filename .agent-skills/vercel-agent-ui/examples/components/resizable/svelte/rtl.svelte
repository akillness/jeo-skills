<script lang="ts">
  import {
    Resizable,
    ResizableHandle,
    ResizablePanel,
  } from "@ui-sdk/svelte/resizable"
</script>

<div dir="rtl">
  <Resizable>
    <ResizablePanel defaultSize={35} minSize={20}>
      <h3>الملفات</h3>
      <ul>
        <li>page.tsx</li>
        <li>layout.tsx</li>
        <li>globals.css</li>
      </ul>
    </ResizablePanel>
    <ResizableHandle aria-label="تغيير حجم الملفات" />
    <ResizablePanel defaultSize={65} minSize={40}>
      <Resizable orientation="vertical">
        <ResizablePanel defaultSize={60} minSize={30}>
          <h3>page.tsx</h3>
          <span data-slot="hint">حُفظ للتو</span>
        </ResizablePanel>
        <ResizableHandle aria-label="تغيير حجم المحرر" />
        <ResizablePanel defaultSize={40} minSize={30}>
          <h3>الطرفية</h3>
          <span data-slot="hint">جاهز على المنفذ 3000</span>
        </ResizablePanel>
      </Resizable>
    </ResizablePanel>
  </Resizable>
</div>
