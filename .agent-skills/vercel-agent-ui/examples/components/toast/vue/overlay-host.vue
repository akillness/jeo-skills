<script setup lang="ts">
import { CircleCheckIcon } from "@lucide/vue"
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  createConfirm,
  type ConfirmOptions,
} from "@ui-sdk/vue/alert-dialog"
import { OverlayHost, createOverlays } from "@ui-sdk/vue/overlays"
import { Toast, ToastTitle, createToaster } from "@ui-sdk/vue/toast"
import { onUnmounted, ref, useTemplateRef } from "vue"

const overlays = createOverlays()
const toast = createToaster({ overlays })
const confirm = createConfirm({ overlays })
const ConfirmAlertDialogContent = AlertDialogContent<ConfirmOptions>
const projects = ref(["Acme", "Globex", "Initech"])
const reset = useTemplateRef<HTMLButtonElement>("reset")
onUnmounted(() => {
  toast.dismiss()
})

async function remove(name: string, button: HTMLButtonElement) {
  const confirmed = await confirm({
    title: `Delete ${name}?`,
    description:
      "The project and its files will be deleted for everyone on your team.",
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
  })
  if (!confirmed) {
    return
  }
  const row = button.closest("li")
  const next = (
    row?.nextElementSibling ?? row?.previousElementSibling
  )?.querySelector("button")
  ;(next ?? reset.value)?.focus()
  projects.value = projects.value.filter((project) => project !== name)
  toast.success(`${name} deleted`, { priority: "assertive" })
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button
        ref="reset"
        type="button"
        @click="projects = ['Acme', 'Globex', 'Initech']"
      >
        Reset Projects
      </button>
    </div>
    <ul data-slot="list" aria-label="Projects">
      <li v-for="name in projects" :key="name" data-slot="row">
        {{ name }}
        <button
          type="button"
          data-size="sm"
          :aria-label="`Delete ${name}`"
          @click="remove(name, $event.currentTarget as HTMLButtonElement)"
        >
          Delete
        </button>
      </li>
      <li v-if="projects.length === 0" data-slot="row">
        All projects deleted.
      </li>
    </ul>
    <OverlayHost :overlays="overlays">
      <template #toast>
        <Toast>
          <CircleCheckIcon data-show="success" aria-hidden="true" />
          <ToastTitle />
        </Toast>
      </template>
    </OverlayHost>
    <AlertDialog :controller="confirm.controller">
      <AlertDialogBackdrop />
      <ConfirmAlertDialogContent v-slot="{ state }">
        <div data-slot="stack">
          <AlertDialogTitle>{{ state.payload?.title }}</AlertDialogTitle>
          <AlertDialogDescription>{{
            state.payload?.description
          }}</AlertDialogDescription>
        </div>
        <div data-slot="row">
          <AlertDialogClose>{{ state.payload?.cancelLabel }}</AlertDialogClose>
          <AlertDialogClose data-variant="solid" value="confirm">
            {{ state.payload?.confirmLabel }}
          </AlertDialogClose>
        </div>
      </ConfirmAlertDialogContent>
    </AlertDialog>
  </div>
</template>
