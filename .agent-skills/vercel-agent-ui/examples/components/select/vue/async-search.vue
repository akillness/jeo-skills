<script setup lang="ts">
import { CheckIcon, ChevronDownIcon } from "@lucide/vue"
import { useAsyncOptions } from "@ui-sdk/vue/async-options"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  Select,
  SelectContent,
  SelectEmpty,
  SelectInput,
  SelectItem,
  SelectItemIndicator,
  SelectList,
  SelectStatus,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/vue/select"
import { ref } from "vue"

const countryList = [
  { value: "ar", label: "Argentina" },
  { value: "au", label: "Australia" },
  { value: "at", label: "Austria" },
  { value: "be", label: "Belgium" },
  { value: "br", label: "Brazil" },
  { value: "ca", label: "Canada" },
  { value: "cl", label: "Chile" },
  { value: "cn", label: "China" },
  { value: "dk", label: "Denmark" },
  { value: "fi", label: "Finland" },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany" },
  { value: "gr", label: "Greece" },
  { value: "in", label: "India" },
  { value: "ie", label: "Ireland" },
  { value: "it", label: "Italy" },
  { value: "jp", label: "Japan" },
  { value: "mx", label: "Mexico" },
  { value: "nl", label: "Netherlands" },
  { value: "no", label: "Norway" },
  { value: "pt", label: "Portugal" },
  { value: "es", label: "Spain" },
  { value: "se", label: "Sweden" },
  { value: "ch", label: "Switzerland" },
]

function searchCountries(
  query: string,
  { signal, page }: { signal: AbortSignal; page: number }
) {
  return new Promise<{ items: typeof countryList; hasMore: boolean }>(
    (resolve, reject) => {
      const timer = setTimeout(() => {
        const needle = query.trim().toLowerCase()
        const found = countryList.filter((country) =>
          country.label.toLowerCase().includes(needle)
        )
        resolve({
          items: found.slice(page * 6, page * 6 + 6),
          hasMore: found.length > page * 6 + 6,
        })
      }, 400)
      signal.addEventListener("abort", () => {
        clearTimeout(timer)
        reject(signal.reason)
      })
    }
  )
}

const query = ref("")
const {
  state: results,
  setQuery,
  loadMore,
} = useAsyncOptions(searchCountries, { immediate: true })
</script>

<template>
  <Field>
    <FieldLabel>Country</FieldLabel>
    <Select
      v-model:query="query"
      :items="results.items"
      :filter="false"
      :status="results.status"
      placeholder="Select a country"
      @query-change="(next) => setQuery(next)"
      @load-more="loadMore"
    >
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        <SelectInput
          aria-label="Search countries"
          placeholder="Search countries…"
        />
        <SelectEmpty v-slot="{ state }">
          <template v-if="state.empty && !state.loading"
            >No countries match “{{ state.query }}”.</template
          >
        </SelectEmpty>
        <SelectList v-slot="{ state }">
          <SelectItem
            v-for="item in state.items as {
              value: string
              label: string
              disabled?: boolean
            }[]"
            :key="item.value"
            :value="item.value"
            :label="item.label"
            :disabled="item.disabled"
          >
            {{ item.label }}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        </SelectList>
        <SelectStatus v-slot="{ state }">
          {{
            state.loading
              ? "Loading…"
              : state.status === "error"
                ? "Couldn't load countries."
                : `${state.count} shown`
          }}
        </SelectStatus>
      </SelectContent>
    </Select>
  </Field>
</template>
