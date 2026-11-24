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

<button
  onclick={() =>
    toast({
      title: "Event has been created",
      description: "Monday, January 3rd at 6:00pm",
    })}
>
  Show toast
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
