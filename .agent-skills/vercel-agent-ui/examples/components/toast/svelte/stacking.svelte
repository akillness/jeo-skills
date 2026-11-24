<script lang="ts">
  import { onDestroy } from "svelte"
  import { CheckIcon } from "@lucide/svelte"
  import { Checkbox, CheckboxIndicator } from "@ui-sdk/svelte/checkbox"
  import {
    Toast,
    ToastDescription,
    ToastRegion,
    ToastTitle,
    createToaster,
  } from "@ui-sdk/svelte/toast"

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
  let expanded = $state(false)
  let count = 0
  onDestroy(() => {
    toast.dismiss()
  })
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <label data-slot="label">
      <Checkbox
        checked={expanded}
        onCheckedChange={(next) => (expanded = next === true)}
      >
        <CheckboxIndicator>
          <CheckIcon aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      Always expanded
    </label>
  </div>
  <button onclick={() => toast(notifications[count++ % notifications.length])}
    >Add Toast</button
  >
  <ToastRegion toaster={toast} maxVisible={4} {expanded}>
    <Toast>
      <div data-slot="stack">
        <ToastTitle />
        <ToastDescription />
      </div>
    </Toast>
  </ToastRegion>
</div>
