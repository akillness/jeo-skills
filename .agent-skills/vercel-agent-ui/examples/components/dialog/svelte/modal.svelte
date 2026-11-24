<script lang="ts">
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
  import { Checkbox, CheckboxIndicator } from "@ui-sdk/svelte/checkbox"
  import {
    Dialog,
    DialogBackdrop,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
  } from "@ui-sdk/svelte/dialog"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectLabel,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"

  const modes = [
    { value: "true", label: "Modal" },
    { value: "trap-focus", label: "Trap focus" },
    { value: "false", label: "Non-modal" },
  ]

  type Mode = "true" | "trap-focus" | "false"

  const notes = {
    true: "The rest of the page is inert and doesn't scroll.",
    "trap-focus":
      "Tab stays inside, and the page still scrolls and takes clicks.",
    false:
      "The page stays usable. Tab leaves the notes, and Escape closes them while focus is inside.",
  }

  let mode = $state<Mode>("false")
  let outside = $state(false)
  const modal = $derived(
    mode === "true" ? true : mode === "false" ? false : "trap-focus"
  )
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <Select
      items={modes}
      value={mode}
      onValueChange={(next) => next && (mode = next as Mode)}
    >
      <SelectLabel>Modal</SelectLabel>
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        {#each modes as option (option.value)}
          <SelectItem value={option.value}>
            {option.label}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
    <label data-slot="label">
      <Checkbox
        checked={outside}
        onCheckedChange={(next) => (outside = next === true)}
      >
        <CheckboxIndicator>
          <CheckIcon aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      Close on outside press
    </label>
  </div>
  <Dialog {modal} closeOnOutsidePress={outside}>
    <DialogTrigger>Open Notes</DialogTrigger>
    {#if modal === true}
      <DialogBackdrop />
    {/if}
    <DialogContent>
      <div data-slot="stack">
        <DialogTitle>Notes</DialogTitle>
        <DialogDescription>{notes[mode]}</DialogDescription>
      </div>
      <textarea aria-label="Notes" value="Call the printer about the proofs."
      ></textarea>
      <div data-slot="row">
        <DialogClose data-variant="solid">Done</DialogClose>
      </div>
    </DialogContent>
  </Dialog>
</div>
