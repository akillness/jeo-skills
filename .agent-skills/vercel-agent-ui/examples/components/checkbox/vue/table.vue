<script setup lang="ts">
import { CheckIcon, MinusIcon } from "@lucide/vue"
import {
  Checkbox,
  CheckboxGroup,
  CheckboxIndicator,
} from "@ui-sdk/vue/checkbox"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const people = [
  {
    id: "hollis",
    name: "Hollis Grant",
    email: "hollis@example.com",
    role: "Owner",
  },
  {
    id: "ines",
    name: "Inès Moreau",
    email: "ines@example.com",
    role: "Editor",
  },
  {
    id: "kofi",
    name: "Kofi Mensah",
    email: "kofi@example.com",
    role: "Viewer",
  },
  {
    id: "wren",
    name: "Wren Takahashi",
    email: "wren@example.com",
    role: "Editor",
  },
]

const log = useLog()
const selected = ref(["hollis"])
</script>

<template>
  <CheckboxGroup
    v-model:value="selected"
    aria-label="Team members"
    :all-values="people.map((person) => person.id)"
    @value-change="
      (next: string[]) => log(`${next.length} of ${people.length} selected`)
    "
  >
    <table>
      <caption data-slot="visually-hidden">
        Team members
      </caption>
      <thead>
        <tr>
          <th>
            <Checkbox aria-label="Select all" parent>
              <CheckboxIndicator>
                <CheckIcon aria-hidden="true" />
                <MinusIcon aria-hidden="true" />
              </CheckboxIndicator>
            </Checkbox>
          </th>
          <th>Name</th>
          <th>Email</th>
          <th>Role</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="person in people" :key="person.id">
          <td>
            <Checkbox :value="person.id" :aria-label="`Select ${person.name}`">
              <CheckboxIndicator>
                <CheckIcon aria-hidden="true" />
              </CheckboxIndicator>
            </Checkbox>
          </td>
          <td>{{ person.name }}</td>
          <td>{{ person.email }}</td>
          <td>{{ person.role }}</td>
        </tr>
      </tbody>
    </table>
  </CheckboxGroup>
</template>
