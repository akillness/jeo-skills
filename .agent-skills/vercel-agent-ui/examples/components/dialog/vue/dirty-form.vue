<script setup lang="ts">
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/vue/dialog"
import { Field, FieldControl, FieldLabel } from "@ui-sdk/vue/field"
import { ref } from "vue"

const open = ref(false)
const dirty = ref(false)
const asking = ref(false)
let post: HTMLTextAreaElement | undefined

function onInput(event: Event) {
  post = event.target as HTMLTextAreaElement
  dirty.value = post.value !== ""
}

function close() {
  open.value = false
  dirty.value = false
  asking.value = false
}

function keepEditing() {
  asking.value = false
  post?.focus()
}
</script>

<template>
  <Dialog
    :open="open"
    :dismissible="!dirty"
    @update:open="(next: boolean) => (next ? (open = true) : close())"
    @dismiss-attempt="asking = true"
  >
    <DialogTrigger>Write a Post</DialogTrigger>
    <DialogBackdrop />
    <DialogContent>
      <div data-slot="stack">
        <DialogTitle>New post</DialogTitle>
        <DialogDescription>Share an update with your team.</DialogDescription>
      </div>
      <Field>
        <FieldLabel>Post</FieldLabel>
        <FieldControl @input="onInput">
          <template #render="{ props }">
            <textarea v-bind="props" placeholder="What's new?" />
          </template>
        </FieldControl>
      </Field>
      <div v-if="asking" data-slot="row" role="alert">
        Discard your changes?
        <div data-slot="row">
          <button type="button" @click="keepEditing">Keep Editing</button>
          <button data-variant="solid" type="button" @click="close">
            Discard
          </button>
        </div>
      </div>
      <div v-else data-slot="row">
        <DialogClose data-variant="solid" value="post">Post</DialogClose>
      </div>
    </DialogContent>
  </Dialog>
</template>
