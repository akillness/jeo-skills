<script lang="ts">
  import { onDestroy } from "svelte"
  import { XIcon } from "@lucide/svelte"
  import {
    Toast,
    ToastAction,
    ToastClose,
    ToastDescription,
    ToastRegion,
    ToastTitle,
    createToaster,
  } from "@ui-sdk/svelte/toast"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  const toast = createToaster()
  onDestroy(() => {
    toast.dismiss()
  })
</script>

<button
  onclick={() =>
    toast({
      title: "Hollis Grant",
      description: "Can you review the draft?",
      data: { initials: "HG" },
      action: {
        label: "Reply",
        onAction: () => log("Replying to Hollis Grant"),
      },
    })}
>
  New Message
</button>
<ToastRegion toaster={toast} aria-label="Messages">
  {#snippet children(item)}
    <Toast>
      {#snippet render({ props, state, children })}
        <li
          {...props}
          inert={state.leaving ||
            (!state.expanded && state.index > 0) ||
            undefined}
        >
          {@render children?.(state)}
        </li>
      {/snippet}
      <span data-slot="media"
        >{(item.data as { initials: string }).initials}</span
      >
      <div data-slot="stack">
        <ToastTitle />
        <ToastDescription />
      </div>
      <ToastAction data-variant="solid" />
      <ToastClose aria-label="Close">
        <XIcon aria-hidden="true" />
      </ToastClose>
    </Toast>
  {/snippet}
</ToastRegion>
