<script setup lang="ts">
import { CheckIcon, LoaderCircleIcon, PlusIcon, XIcon } from "@lucide/vue"
import {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxContent,
  ComboboxCreate,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
  ComboboxValue,
} from "@ui-sdk/vue/combobox"
import { ref } from "vue"

const initialLabels = [
  "Bug",
  "Feature",
  "Documentation",
  "Design",
  "Performance",
  "Security",
  "Testing",
]

function saveLabel(name: string) {
  return new Promise<void>((resolve, reject) =>
    setTimeout(
      () =>
        name.length > 20
          ? reject(new Error("Labels are 20 characters at most."))
          : resolve(),
      800
    )
  )
}

const labels = ref(initialLabels)
const value = ref<string[]>(["Bug"])

async function create(query: string) {
  await saveLabel(query)
  labels.value = [...labels.value, query]
  value.value = [...value.value, query]
}
</script>

<template>
  <Combobox v-model:value="value" multiple>
    <div data-slot="stack">
      <ComboboxLabel>Labels</ComboboxLabel>
      <ComboboxChips>
        <ComboboxValue v-slot="{ value: selected }">
          <ComboboxChip
            v-for="label in selected as string[]"
            :key="label"
            :value="label"
          >
            {{ label }}
            <ComboboxChipRemove :aria-label="`Remove ${label}`">
              <XIcon aria-hidden="true" />
            </ComboboxChipRemove>
          </ComboboxChip>
        </ComboboxValue>
        <ComboboxInput placeholder="Add or create a label…" />
      </ComboboxChips>
    </div>
    <ComboboxContent>
      <ComboboxList>
        <ComboboxItem v-for="label in labels" :key="label" :value="label">
          {{ label }}
          <ComboboxItemIndicator>
            <CheckIcon aria-hidden="true" />
          </ComboboxItemIndicator>
        </ComboboxItem>
        <ComboboxCreate v-slot="{ state }" :min-length="2" :on-create="create">
          <template v-if="state.pending">
            <LoaderCircleIcon aria-hidden="true" data-slot="spinner" />
            Creating “{{ state.query }}”…
          </template>
          <template v-else>
            <PlusIcon aria-hidden="true" />
            <span data-slot="stack">
              Create “{{ state.query }}”
              <span v-if="state.error" data-slot="hint">{{
                (state.error as Error).message
              }}</span>
            </span>
          </template>
        </ComboboxCreate>
      </ComboboxList>
    </ComboboxContent>
  </Combobox>
</template>
