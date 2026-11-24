<script lang="ts">
  import {
    Toast,
    ToastDescription,
    ToastRegion,
    ToastTitle,
    createToaster,
  } from "@ui-sdk/svelte/toast"

  const toast = createToaster()
</script>

<div dir="rtl">
  <button
    onclick={() =>
      toast("تم إنشاء الحدث", {
        description: "الأحد 3 ديسمبر الساعة 9:00 صباحًا",
      })}
  >
    إظهار الإشعار
  </button>
  <ToastRegion toaster={toast}>
    {#snippet children(item)}
      <Toast>
        <div data-slot="stack">
          <ToastTitle />
          <ToastDescription />
        </div>
      </Toast>
    {/snippet}
  </ToastRegion>
</div>
