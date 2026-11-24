<script setup lang="ts">
import { CheckIcon, ChevronDownIcon, XIcon } from "@lucide/vue"
import {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@ui-sdk/vue/combobox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/vue/field"
import { useLog } from "../../../shared/vue/log"

const countries = [
  { value: "ar", label: "Argentina" },
  { value: "au", label: "Australia" },
  { value: "at", label: "Austria" },
  { value: "be", label: "Belgium" },
  { value: "br", label: "Brazil" },
  { value: "ca", label: "Canada" },
  { value: "cl", label: "Chile" },
  { value: "dk", label: "Denmark" },
  { value: "fi", label: "Finland" },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany" },
  { value: "gr", label: "Greece" },
  { value: "jp", label: "Japan" },
  { value: "nl", label: "Netherlands" },
  { value: "es", label: "Spain" },
  { value: "se", label: "Sweden" },
  { value: "ch", label: "Switzerland" },
]

const countryLabel = (value: string) =>
  countries.find((country) => country.value === value)?.label ?? value

const interests = ["Design", "Engineering", "Marketing", "Research", "Sales"]

const log = useLog()

function submit(event: Event) {
  const entries = [...new FormData(event.currentTarget as HTMLFormElement)].map(
    ([name, value]) => `${name}=${value}`
  )
  log(`Submitted ${entries.join("&")}`)
}
</script>

<template>
  <form data-slot="stack" @submit.prevent="submit">
    <Field name="country">
      <FieldLabel>Country</FieldLabel>
      <Combobox required :item-to-label="countryLabel">
        <div data-slot="row">
          <ComboboxInput placeholder="Search countries…" />
          <ComboboxTrigger aria-label="Show countries">
            <ChevronDownIcon aria-hidden="true" />
          </ComboboxTrigger>
        </div>
        <ComboboxContent>
          <ComboboxEmpty>No countries found.</ComboboxEmpty>
          <ComboboxList>
            <ComboboxItem
              v-for="country in countries"
              :key="country.value"
              :value="country.value"
              :label="country.label"
            >
              {{ country.label }}
              <ComboboxItemIndicator>
                <CheckIcon aria-hidden="true" />
              </ComboboxItemIndicator>
            </ComboboxItem>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldDescription>Where we ship your order.</FieldDescription>
      <div>
        <FieldError match="valueMissing">Choose a country.</FieldError>
      </div>
    </Field>
    <Field name="interests">
      <FieldLabel>Interests</FieldLabel>
      <Combobox multiple :default-value="['Design']">
        <ComboboxChips>
          <ComboboxValue v-slot="{ value }">
            <ComboboxChip
              v-for="interest in value as string[]"
              :key="interest"
              :value="interest"
            >
              {{ interest }}
              <ComboboxChipRemove :aria-label="`Remove ${interest}`">
                <XIcon aria-hidden="true" />
              </ComboboxChipRemove>
            </ComboboxChip>
          </ComboboxValue>
          <ComboboxInput placeholder="Add interests…" />
        </ComboboxChips>
        <ComboboxContent>
          <ComboboxList>
            <ComboboxItem
              v-for="interest in interests"
              :key="interest"
              :value="interest"
            >
              {{ interest }}
              <ComboboxItemIndicator>
                <CheckIcon aria-hidden="true" />
              </ComboboxItemIndicator>
            </ComboboxItem>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
    <div data-slot="row">
      <button type="submit">Submit</button>
      <button type="reset">Reset</button>
    </div>
  </form>
</template>
