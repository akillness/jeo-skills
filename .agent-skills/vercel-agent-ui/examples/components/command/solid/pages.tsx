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
} from "@ui-sdk/solid/command"
import { createSignal, For, Show } from "solid-js"

const icon = (markup: string) => () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    innerHTML={markup}
  />
)
const Moon = icon(
  '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />'
)
const Users = icon(
  '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><path d="M16 3.128a4 4 0 0 1 0 7.744" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" />'
)
const ArrowLeft = icon('<path d="m12 19-7-7 7-7" /><path d="M19 12H5" />')

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
  const command = createCommandController()
  const [pages, setPages] = createSignal<string[]>([])
  return (
    <Command
      controller={command}
      pages={pages()}
      onPagesChange={(next) => setPages(next)}
      onAction={(value) => {
        if (value === "back") {
          command.pop()
        }
      }}
    >
      <div data-slot="row">
        <For each={pages()}>
          {(page) => <span data-slot="badge">{page}</span>}
        </For>
      </div>
      <CommandInput
        aria-label="Search commands"
        placeholder={
          pages().length
            ? "Search… (Backspace to go back)"
            : "What do you need?"
        }
      />
      <CommandEmpty>No results found.</CommandEmpty>
      <CommandList>
        <CommandPage>
          <CommandGroup>
            <CommandGroupLabel>Workspace</CommandGroupLabel>
            <CommandItem value="theme" page="theme">
              <CommandItemIcon>
                <Moon />
              </CommandItemIcon>
              Change theme…
            </CommandItem>
            <CommandItem value="teams" page="teams">
              <CommandItemIcon>
                <Users />
              </CommandItemIcon>
              Switch team…
            </CommandItem>
          </CommandGroup>
        </CommandPage>
        <CommandPage value="theme">
          <For each={themes}>
            {(theme) => (
              <CommandItem value={theme.value}>{theme.label}</CommandItem>
            )}
          </For>
        </CommandPage>
        <CommandPage value="teams">
          <For each={teams}>
            {(team) => (
              <CommandItem value={team.value}>{team.label}</CommandItem>
            )}
          </For>
        </CommandPage>
        <Show when={pages().length > 0}>
          <CommandItem value="back">
            <CommandItemIcon mirror>
              <ArrowLeft />
            </CommandItemIcon>
            Go back
          </CommandItem>
        </Show>
      </CommandList>
    </Command>
  )
}

export { Example }
