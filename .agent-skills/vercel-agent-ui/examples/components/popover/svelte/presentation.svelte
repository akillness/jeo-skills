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

<Popover presentation="sheet">
  <PopoverTrigger>Add Reminder</PopoverTrigger>
  <PopoverContent>
    <PopoverTitle>New reminder</PopoverTitle>
    <PopoverDescription
      >We'll notify you at the time you pick.</PopoverDescription
    >
    <Field>
      <FieldLabel>Remind me to</FieldLabel>
      <Input defaultValue="Send the Q3 roadmap" />
    </Field>
    <div data-slot="row">
      <PopoverClose>Cancel</PopoverClose>
      <PopoverClose data-variant="solid">Save</PopoverClose>
    </div>
  </PopoverContent>
</Popover>
