<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Input } from "@ui-sdk/vue/input"
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/vue/popover"
</script>

<template>
  <div data-slot="row">
    <Popover>
      <PopoverTrigger>Rename</PopoverTrigger>
      <PopoverContent>
        <PopoverTitle>Rename file</PopoverTitle>
        <PopoverDescription
          >Focus starts in the first field.</PopoverDescription
        >
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input default-value="Q3 roadmap.pdf" />
        </Field>
        <div data-slot="row">
          <PopoverClose>Cancel</PopoverClose>
          <PopoverClose data-variant="solid">Save</PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
    <Popover>
      <PopoverTrigger>Publish</PopoverTrigger>
      <PopoverContent initial-focus="[data-autofocus]">
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
      <PopoverContent initial-focus="none" final-focus="none">
        <PopoverTitle>All systems normal</PopoverTitle>
        <PopoverDescription>Focus stays on the trigger.</PopoverDescription>
      </PopoverContent>
    </Popover>
  </div>
</template>
