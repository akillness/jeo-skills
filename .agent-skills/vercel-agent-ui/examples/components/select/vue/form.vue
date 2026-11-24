<script setup lang="ts">
import { CheckIcon, ChevronDownIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/vue/select"
import { useLog } from "../../../shared/vue/log"

const countries = [
  { value: "au", label: "Australia" },
  { value: "br", label: "Brazil" },
  { value: "ca", label: "Canada" },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany" },
  { value: "jp", label: "Japan" },
  { value: "es", label: "Spain" },
  { value: "se", label: "Sweden" },
]

const topics = ["Design", "Engineering", "Marketing", "Research", "Sales"]

const frequencies = ["Daily", "Weekly", "Monthly"]

const log = useLog()

function submit(event: Event) {
  const entries = [...new FormData(event.currentTarget as HTMLFormElement)].map(
    ([name, value]) => `${name}=${value}`
  )
  log(`Submitted ${entries.join("&")}`)
}
</script>

<template>
  <div data-slot="stack">
    <form id="select-newsletter" data-slot="stack" @submit.prevent="submit">
      <Field>
        <FieldLabel>Country</FieldLabel>
        <Select
          name="country"
          auto-complete="country"
          required
          placeholder="Select a country"
        >
          <SelectTrigger>
            <SelectValue />
            <ChevronDownIcon />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="country in countries"
              :key="country.value"
              :value="country.value"
            >
              {{ country.label }}
              <SelectItemIndicator>
                <CheckIcon />
              </SelectItemIndicator>
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>Topics</FieldLabel>
        <Select name="topics" multiple :default-value="['Design']">
          <SelectTrigger>
            <SelectValue />
            <ChevronDownIcon />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="topic in topics" :key="topic" :value="topic">
              {{ topic }}
              <SelectItemIndicator>
                <CheckIcon />
              </SelectItemIndicator>
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </form>
    <Field>
      <FieldLabel>Frequency</FieldLabel>
      <Select name="frequency" form="select-newsletter" default-value="Weekly">
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="frequency in frequencies"
            :key="frequency"
            :value="frequency"
          >
            {{ frequency }}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        </SelectContent>
      </Select>
    </Field>
    <div data-slot="row">
      <button type="submit" form="select-newsletter" data-variant="solid">
        Save
      </button>
      <button type="reset" form="select-newsletter">Reset</button>
    </div>
  </div>
</template>
