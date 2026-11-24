<script setup lang="ts">
import { Field, FieldControl, FieldLabel } from "@ui-sdk/vue/field"
import {
  createPopoverController,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/vue/popover"
import { computed, ref } from "vue"
import { useLog } from "../../../shared/vue/log"

type Member = { name: string; role: string }

const roles = ["Admin", "Editor", "Viewer"]

const log = useLog()
const popover = createPopoverController<Member>()
const MemberPopoverContent = PopoverContent<Member>
const members = ref<Member[]>([
  { name: "Hollis Grant", role: "Owner" },
  { name: "Inès Moreau", role: "Editor" },
  { name: "Kofi Mensah", role: "Viewer" },
  { name: "Wren Takahashi", role: "Viewer" },
])
const newest = computed(() => members.value[members.value.length - 1])

async function editNewest(event: MouseEvent) {
  const result = await popover.open({
    payload: newest.value,
    anchor: event.currentTarget as HTMLElement,
  })
  log(`Closed (${result.reason}), returned ${result.returnValue ?? "nothing"}`)
}

function onPayloadChange(payload: unknown) {
  const member = payload as Member | undefined
  if (member) {
    log(`Editing ${member.name}`)
  }
}

function save(event: SubmitEvent, member: Member | undefined) {
  if ((event.submitter as HTMLButtonElement).value !== "save" || !member) {
    return
  }
  const role = String(
    new FormData(event.currentTarget as HTMLFormElement).get("role")
  )
  members.value = members.value.map((entry) =>
    entry.name === member.name ? { ...entry, role } : entry
  )
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="editNewest">Edit Newest Member</button>
    </div>
    <ul data-slot="list">
      <li v-for="member in members" :key="member.name" data-slot="row">
        {{ member.name }}
        <span data-slot="hint">{{ member.role }}</span>
        <PopoverTrigger
          :controller="popover"
          :payload="member"
          :disabled="member.role === 'Owner'"
          data-size="sm"
          data-variant="ghost"
          :aria-label="`Edit ${member.name}`"
        >
          Edit
        </PopoverTrigger>
      </li>
    </ul>
    <Popover :controller="popover" @payload-change="onPayloadChange">
      <MemberPopoverContent v-slot="{ state }" align="end" :side-offset="8">
        <PopoverTitle>{{ state.payload?.name }}</PopoverTitle>
        <PopoverDescription
          >Roles decide what they can change.</PopoverDescription
        >
        <form
          data-slot="stack"
          method="dialog"
          @submit="save($event as SubmitEvent, state.payload)"
        >
          <Field>
            <FieldLabel>Role</FieldLabel>
            <FieldControl
              :key="state.payload?.name"
              name="role"
              :default-value="state.payload?.role"
            >
              <template #render="{ props }">
                <select v-bind="props">
                  <option v-for="role in roles" :key="role">{{ role }}</option>
                </select>
              </template>
            </FieldControl>
          </Field>
          <div data-slot="row">
            <button type="submit" value="cancel" formnovalidate>Cancel</button>
            <button type="submit" value="save" data-variant="solid">
              Save
            </button>
          </div>
        </form>
      </MemberPopoverContent>
    </Popover>
  </div>
</template>
