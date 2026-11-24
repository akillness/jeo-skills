<script lang="ts">
  import { onDestroy } from "svelte"
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectLabel,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"
  import {
    Toast,
    ToastDescription,
    ToastRegion,
    ToastTitle,
    createToaster,
  } from "@ui-sdk/svelte/toast"

  const sides = [
    { value: "top", label: "Top" },
    { value: "bottom", label: "Bottom" },
  ]
  const aligns = [
    { value: "start", label: "Start" },
    { value: "center", label: "Center" },
    { value: "end", label: "End" },
  ]
  type Side = "top" | "bottom"
  type Align = "start" | "center" | "end"

  const toast = createToaster()
  let side = $state<Side>("bottom")
  let align = $state<Align>("end")
  onDestroy(() => {
    toast.dismiss()
  })
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <Select
      items={sides}
      value={side}
      onValueChange={(next) => next && (side = next as Side)}
    >
      <SelectLabel>Side</SelectLabel>
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon aria-hidden="true" />
      </SelectTrigger>
      <SelectContent>
        {#each sides as option (option.value)}
          <SelectItem value={option.value}>
            {option.label}
            <SelectItemIndicator>
              <CheckIcon aria-hidden="true" />
            </SelectItemIndicator>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
    <Select
      items={aligns}
      value={align}
      onValueChange={(next) => next && (align = next as Align)}
    >
      <SelectLabel>Align</SelectLabel>
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon aria-hidden="true" />
      </SelectTrigger>
      <SelectContent>
        {#each aligns as option (option.value)}
          <SelectItem value={option.value}>
            {option.label}
            <SelectItemIndicator>
              <CheckIcon aria-hidden="true" />
            </SelectItemIndicator>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </div>
  <button
    onclick={() =>
      toast("Event created", { description: "Friday, June 12 at 10:00 AM" })}
  >
    Create Event
  </button>
  <ToastRegion toaster={toast} {side} {align}>
    <Toast>
      <div data-slot="stack">
        <ToastTitle />
        <ToastDescription />
      </div>
    </Toast>
  </ToastRegion>
</div>
