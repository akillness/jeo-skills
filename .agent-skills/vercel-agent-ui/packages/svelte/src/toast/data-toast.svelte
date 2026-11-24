<script lang="ts">
  import type { Toast as ToastData } from "@ui-sdk/core/toast"
  import Content from "./content.svelte"
  import type { ToastContent } from "./context"
  import ToastAction from "./toast-action.svelte"
  import ToastClose from "./toast-close.svelte"
  import ToastDescription from "./toast-description.svelte"
  import ToastTitle from "./toast-title.svelte"
  import Toast from "./toast.svelte"

  // A toast rendered from its data, with the parts.
  let { toast }: { toast: ToastData<ToastContent> } = $props()
</script>

<Toast>
  <div>
    {#if toast.title != null}<ToastTitle />{/if}
    {#if toast.description != null}<ToastDescription />{/if}
  </div>
  {#if toast.action}<ToastAction />{/if}
  {#if toast.cancel}
    <ToastClose action={toast.cancel.onCancel}>
      <Content content={toast.cancel.label} />
    </ToastClose>
  {/if}
</Toast>
