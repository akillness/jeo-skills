<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Input } from "@ui-sdk/svelte/input"
  import {
    Popover,
    PopoverClose,
    PopoverContent,
    PopoverDescription,
    PopoverTitle,
    PopoverTrigger,
  } from "@ui-sdk/svelte/popover"
</script>

<div data-slot="row">
  <Popover>
    <PopoverTrigger>Rename</PopoverTrigger>
    <PopoverContent>
      <PopoverTitle>Rename file</PopoverTitle>
      <PopoverDescription>Focus starts in the first field.</PopoverDescription>
      <Field>
        <FieldLabel>Name</FieldLabel>
        <Input defaultValue="Q3 roadmap.pdf" />
      </Field>
      <div data-slot="row">
        <PopoverClose>Cancel</PopoverClose>
        <PopoverClose data-variant="solid">Save</PopoverClose>
      </div>
    </PopoverContent>
  </Popover>
  <Popover>
    <PopoverTrigger>Publish</PopoverTrigger>
    <PopoverContent initialFocus="[data-autofocus]">
      <PopoverTitle>Publish changes?</PopoverTitle>
      <PopoverDescription
        >Focus starts on Publish, not Cancel.</PopoverDescription
      >
      <div data-slot="row">
        <PopoverClose>Cancel</PopoverClose>
        <PopoverClose data-autofocus="" data-variant="solid"
          >Publish</PopoverClose
        >
      </div>
    </PopoverContent>
  </Popover>
  <Popover>
    <PopoverTrigger>Status</PopoverTrigger>
    <PopoverContent initialFocus="none" finalFocus="none">
      <PopoverTitle>All systems normal</PopoverTitle>
      <PopoverDescription>Focus stays on the trigger.</PopoverDescription>
    </PopoverContent>
  </Popover>
</div>
