<script setup lang="ts">
import { Field, FieldControl, FieldLabel } from "@ui-sdk/vue/field"
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
const note = ref("")
const asking = ref(false)
let field: HTMLTextAreaElement | undefined

function close() {
  open.value = false
  note.value = ""
  asking.value = false
}

function onInput(event: Event) {
  field = event.target as HTMLTextAreaElement
  note.value = field.value
}

function onDismissAttempt(details: { reason: string }) {
  log(`Kept open (${details.reason})`)
  asking.value = true
}

function keepEditing() {
  asking.value = false
  field?.focus()
}

function discard() {
  log("Discarded the note")
  close()
}

function save() {
  log(note.value ? "Saved the note" : "Nothing to save")
  close()
}
</script>

<template>
  <Popover
    :open="open"
    :dismissible="note === ''"
    @update:open="(next: boolean) => (next ? (open = true) : close())"
    @dismiss-attempt="onDismissAttempt"
  >
    <PopoverTrigger>Add Note</PopoverTrigger>
    <PopoverContent>
      <PopoverTitle>Add a note</PopoverTitle>
      <PopoverDescription>Only your team can see it.</PopoverDescription>
      <Field>
        <FieldLabel>Note</FieldLabel>
        <FieldControl :value="note" @input="onInput">
          <template #render="{ props }">
            <textarea
              v-bind="props"
              placeholder="Call the printer about the proofs."
            />
          </template>
        </FieldControl>
      </Field>
      <div v-if="asking" data-slot="row" role="alert">
        Discard your note?
        <div data-slot="row">
          <button type="button" data-size="sm" @click="keepEditing">
            Keep Editing
          </button>
          <button
            type="button"
            data-size="sm"
            data-variant="solid"
            @click="discard"
          >
            Discard
          </button>
        </div>
      </div>
      <div v-else data-slot="row">
        <PopoverClose>Cancel</PopoverClose>
        <button type="button" data-variant="solid" @click="save">Save</button>
      </div>
    </PopoverContent>
  </Popover>
</template>
