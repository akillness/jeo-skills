"use client"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandItemIcon,
  CommandList,
  CommandPage,
  createCommandController,
} from "@ui-sdk/react/command"
import { ArrowLeftIcon, MoonIcon, UsersIcon } from "lucide-react"
import * as React from "react"

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

const teams = [
  { value: "design", label: "Design" },
  { value: "engineering", label: "Engineering" },
  { value: "marketing", label: "Marketing" },
]

function Example() {
  const command = React.useState(() => createCommandController())[0]
  const [pages, setPages] = React.useState<string[]>([])
  return (
    <Command
      controller={command}
      pages={pages}
      onPagesChange={setPages}
      onAction={(value) => {
        if (value === "back") {
          command.pop()
        }
      }}
    >
      <div data-slot="row">
        {pages.map((page) => (
          <span key={page} data-slot="badge">
            {page}
          </span>
        ))}
      </div>
      <CommandInput
        aria-label="Search commands"
        placeholder={
          pages.length ? "Search… (Backspace to go back)" : "What do you need?"
        }
      />
      <CommandEmpty>No results found.</CommandEmpty>
      <CommandList>
        <CommandPage>
          <CommandGroup>
            <CommandGroupLabel>Workspace</CommandGroupLabel>
            <CommandItem value="theme" page="theme">
              <CommandItemIcon>
                <MoonIcon />
              </CommandItemIcon>
              Change theme…
            </CommandItem>
            <CommandItem value="teams" page="teams">
              <CommandItemIcon>
                <UsersIcon />
              </CommandItemIcon>
              Switch team…
            </CommandItem>
          </CommandGroup>
        </CommandPage>
        <CommandPage value="theme">
          {themes.map((theme) => (
            <CommandItem key={theme.value} value={theme.value}>
              {theme.label}
            </CommandItem>
          ))}
        </CommandPage>
        <CommandPage value="teams">
          {teams.map((team) => (
            <CommandItem key={team.value} value={team.value}>
              {team.label}
            </CommandItem>
          ))}
        </CommandPage>
        {pages.length > 0 && (
          <CommandItem value="back">
            <CommandItemIcon mirror>
              <ArrowLeftIcon />
            </CommandItemIcon>
            Go back
          </CommandItem>
        )}
      </CommandList>
    </Command>
  )
}

export { Example }
