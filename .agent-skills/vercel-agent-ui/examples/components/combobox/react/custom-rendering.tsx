import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@ui-sdk/react/combobox"
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SearchIcon,
} from "lucide-react"

const users = [
  { id: 1, name: "Hollis Grant", username: "hollis", role: "Owner" },
  { id: 2, name: "Inès Moreau", username: "ines", role: "Admin" },
  { id: 3, name: "Kofi Mensah", username: "kofi", role: "Member" },
  { id: 4, name: "Wren Takahashi", username: "wren", role: "Member" },
  { id: 5, name: "Tomasz Wójcik", username: "tomasz", role: "Guest" },
]

function Example() {
  return (
    <Combobox>
      <div data-slot="stack">
        <ComboboxLabel>Assignee</ComboboxLabel>
        <div data-slot="row">
          <ComboboxInput
            placeholder="Search people…"
            render={(props) => (
              <div data-slot="row">
                <SearchIcon aria-hidden="true" />
                <input {...props} />
              </div>
            )}
          />
          <ComboboxTrigger aria-label="Show people">
            {(state) =>
              state.open ? (
                <ChevronUpIcon aria-hidden="true" />
              ) : (
                <ChevronDownIcon aria-hidden="true" />
              )
            }
          </ComboboxTrigger>
        </div>
      </div>
      <ComboboxContent>
        <ComboboxEmpty>No one by that name.</ComboboxEmpty>
        <ComboboxList>
          {users.map((user) => (
            <ComboboxItem
              key={user.id}
              value={user.username}
              label={user.name}
              keywords={[user.username]}
            >
              {(state) => (
                <>
                  <span data-slot="badge">{user.name.slice(0, 1)}</span>
                  <span data-slot="stack">
                    {user.name}
                    <span data-slot="hint">@{user.username}</span>
                  </span>
                  {state.selected ? (
                    <CheckIcon aria-hidden="true" />
                  ) : state.highlighted ? (
                    <kbd data-slot="kbd">Enter</kbd>
                  ) : null}
                </>
              )}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export { Example }
