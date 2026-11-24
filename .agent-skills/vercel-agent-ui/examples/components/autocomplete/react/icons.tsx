"use client"

import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteItemIcon,
  AutocompleteList,
} from "@ui-sdk/react/autocomplete"
import {
  ArchiveIcon,
  ClockIcon,
  FileIcon,
  PencilIcon,
  ReplyIcon,
  StarIcon,
} from "lucide-react"

const mailSearches = [
  { value: "Starred", icon: StarIcon },
  { value: "Drafts", icon: PencilIcon },
  { value: "Replies", icon: ReplyIcon, mirror: true },
  { value: "Attachments", icon: FileIcon },
  { value: "Archived", icon: ArchiveIcon },
  { value: "Scheduled", icon: ClockIcon },
]

function Example() {
  return (
    <Autocomplete>
      <AutocompleteInput
        type="search"
        aria-label="Search mail"
        placeholder="Search mail…"
      />
      <AutocompleteContent>
        <AutocompleteEmpty>No searches found.</AutocompleteEmpty>
        <AutocompleteList>
          {mailSearches.map((search) => (
            <AutocompleteItem key={search.value} value={search.value}>
              <AutocompleteItemIcon mirror={search.mirror}>
                <search.icon />
              </AutocompleteItemIcon>
              {search.value}
            </AutocompleteItem>
          ))}
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}

export { Example }
