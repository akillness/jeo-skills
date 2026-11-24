<script lang="ts">
  import {
    ArchiveIcon,
    ClockIcon,
    FileIcon,
    PencilIcon,
    ReplyIcon,
    StarIcon,
  } from "@lucide/svelte"
  import {
    Autocomplete,
    AutocompleteContent,
    AutocompleteEmpty,
    AutocompleteInput,
    AutocompleteItem,
    AutocompleteItemIcon,
    AutocompleteList,
  } from "@ui-sdk/svelte/autocomplete"

  const mailSearches = [
    { value: "Starred", icon: StarIcon },
    { value: "Drafts", icon: PencilIcon },
    { value: "Replies", icon: ReplyIcon, mirror: true },
    { value: "Attachments", icon: FileIcon },
    { value: "Archived", icon: ArchiveIcon },
    { value: "Scheduled", icon: ClockIcon },
  ]
</script>

<Autocomplete>
  <AutocompleteInput
    type="search"
    aria-label="Search mail"
    placeholder="Search mail…"
  />
  <AutocompleteContent>
    <AutocompleteEmpty>No searches found.</AutocompleteEmpty>
    <AutocompleteList>
      {#each mailSearches as search (search.value)}
        <AutocompleteItem value={search.value}>
          <AutocompleteItemIcon mirror={search.mirror}>
            <search.icon />
          </AutocompleteItemIcon>
          {search.value}
        </AutocompleteItem>
      {/each}
    </AutocompleteList>
  </AutocompleteContent>
</Autocomplete>
