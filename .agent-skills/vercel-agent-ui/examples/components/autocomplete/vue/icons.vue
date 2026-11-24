<script setup lang="ts">
import {
  ArchiveIcon,
  ClockIcon,
  FileIcon,
  PencilIcon,
  ReplyIcon,
  StarIcon,
} from "@lucide/vue"
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteItemIcon,
  AutocompleteList,
} from "@ui-sdk/vue/autocomplete"

const mailSearches = [
  { value: "Starred", icon: StarIcon },
  { value: "Drafts", icon: PencilIcon },
  { value: "Replies", icon: ReplyIcon, mirror: true },
  { value: "Attachments", icon: FileIcon },
  { value: "Archived", icon: ArchiveIcon },
  { value: "Scheduled", icon: ClockIcon },
]
</script>

<template>
  <Autocomplete>
    <AutocompleteInput
      type="search"
      aria-label="Search mail"
      placeholder="Search mail…"
    />
    <AutocompleteContent>
      <AutocompleteEmpty>No searches found.</AutocompleteEmpty>
      <AutocompleteList>
        <AutocompleteItem
          v-for="search in mailSearches"
          :key="search.value"
          :value="search.value"
          ><AutocompleteItemIcon :mirror="search.mirror"
            ><component :is="search.icon" /></AutocompleteItemIcon
          >{{ search.value }}</AutocompleteItem
        >
      </AutocompleteList>
    </AutocompleteContent>
  </Autocomplete>
</template>
