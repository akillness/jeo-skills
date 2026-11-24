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
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const open = ref(false)

function onSubmit(event: Event) {
  log(
    `Saved ${new FormData(event.currentTarget as HTMLFormElement).get("name")}`
  )
  open.value = false
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger>Edit Profile</PopoverTrigger>
    <PopoverContent>
      <PopoverTitle>Edit profile</PopoverTitle>
      <PopoverDescription>Your name shows on your posts.</PopoverDescription>
      <form data-slot="stack" @submit.prevent="onSubmit">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input name="name" required default-value="Hollis Grant" />
        </Field>
        <div data-slot="row">
          <PopoverClose>Cancel</PopoverClose>
          <button type="submit" data-variant="solid">Save</button>
        </div>
      </form>
    </PopoverContent>
  </Popover>
</template>
