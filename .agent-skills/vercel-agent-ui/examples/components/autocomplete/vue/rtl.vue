<script setup lang="ts">
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
} from "@ui-sdk/vue/autocomplete"

const cities = ["القاهرة", "القدس", "الرباط", "الرياض", "بيروت", "دبي", "عمّان"]
</script>

<template>
  <div dir="rtl">
    <Autocomplete inline-complete>
      <div data-slot="stack">
        <AutocompleteLabel>المدينة</AutocompleteLabel>
        <AutocompleteInput placeholder="مثلاً: دبي" />
      </div>
      <AutocompleteContent>
        <AutocompleteList>
          <AutocompleteItem v-for="city in cities" :key="city" :value="city">{{
            city
          }}</AutocompleteItem>
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  </div>
</template>
