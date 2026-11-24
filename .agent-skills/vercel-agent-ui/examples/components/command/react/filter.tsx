"use client"

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@ui-sdk/react/command"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import * as React from "react"

const commands = [
  { label: "Home" },
  { label: "Inbox", keywords: ["mail", "messages"] },
  { label: "Documents" },
  { label: "Downloads" },
  { label: "New file" },
  { label: "New folder" },
  { label: "Copy" },
  { label: "Paste" },
  { label: "Delete", keywords: ["remove", "trash"] },
  { label: "Zoom in" },
  { label: "Zoom out" },
  { label: "Search emoji", keywords: ["smiley", "face"] },
  { label: "Keyboard shortcuts", keywords: ["hotkeys"] },
  { label: "Settings", keywords: ["preferences"] },
]

const modes = [
  { value: "fuzzy", label: "Fuzzy" },
  { value: "contains", label: "Contains" },
  { value: "startsWith", label: "Starts with" },
  { value: "words", label: "Words" },
]
type Mode = "fuzzy" | "contains" | "startsWith" | "words"

function words(item: { label: string }, query: string) {
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) =>
      item.label
        .toLowerCase()
        .split(" ")
        .some((part) => part.startsWith(word))
    )
}

function Example() {
  const [mode, setMode] = React.useState<Mode>("fuzzy")
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <Select
          items={modes}
          value={mode}
          onValueChange={(next) => next && setMode(next as Mode)}
        >
          <SelectLabel>Filter</SelectLabel>
          <SelectTrigger>
            <SelectValue />
            <ChevronDownIcon />
          </SelectTrigger>
          <SelectContent>
            {modes.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
                <SelectItemIndicator>
                  <CheckIcon />
                </SelectItemIndicator>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Command filter={mode === "words" ? words : mode}>
        <CommandInput
          aria-label="Search commands"
          placeholder="Try “nf”, “zo in” or “smiley”"
        />
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandList>
          {commands.map((command) => (
            <CommandItem
              key={command.label}
              value={command.label}
              keywords={command.keywords}
            >
              {command.label}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </div>
  )
}

export { Example }
