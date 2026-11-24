<script setup lang="ts">
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  createConfirm,
} from "@ui-sdk/vue/alert-dialog"
import { ref, useTemplateRef } from "vue"

const confirm = createConfirm<{ name: string }>()
const ProjectAlertDialogContent = AlertDialogContent<{ name: string }>
const projects = ref(["Acme", "Globex", "Initech"])
const reset = useTemplateRef<HTMLButtonElement>("reset")

async function remove(name: string, button: HTMLButtonElement) {
  if (!(await confirm({ name }))) {
    return
  }
  const row = button.closest("li")
  const next = (
    row?.nextElementSibling ?? row?.previousElementSibling
  )?.querySelector("button")
  const target = next ?? reset.value
  target?.focus()
  projects.value = projects.value.filter((project) => project !== name)
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
    <AlertDialog :controller="confirm.controller">
      <AlertDialogBackdrop />
      <ProjectAlertDialogContent v-slot="{ state }">
        <div data-slot="stack">
          <AlertDialogTitle>Delete {{ state.payload?.name }}?</AlertDialogTitle>
          <AlertDialogDescription>
            The project and its files will be deleted for everyone on your team.
          </AlertDialogDescription>
        </div>
        <div data-slot="row">
          <AlertDialogClose>Cancel</AlertDialogClose>
          <AlertDialogClose data-variant="solid" value="confirm"
            >Delete</AlertDialogClose
          >
        </div>
      </ProjectAlertDialogContent>
    </AlertDialog>
  </div>
</template>
