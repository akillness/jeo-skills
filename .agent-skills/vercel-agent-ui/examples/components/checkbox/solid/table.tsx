import {
  Checkbox,
  CheckboxGroup,
  CheckboxIndicator,
} from "@ui-sdk/solid/checkbox"
import { createSignal, For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const people = [
  {
    id: "hollis",
    name: "Hollis Grant",
    email: "hollis@example.com",
    role: "Owner",
  },
  {
    id: "ines",
    name: "Inès Moreau",
    email: "ines@example.com",
    role: "Editor",
  },
  {
    id: "kofi",
    name: "Kofi Mensah",
    email: "kofi@example.com",
    role: "Viewer",
  },
  {
    id: "wren",
    name: "Wren Takahashi",
    email: "wren@example.com",
    role: "Editor",
  },
]

function Example() {
  const log = useLog()
  const [selected, setSelected] = createSignal(["hollis"])

  return (
    <CheckboxGroup
      aria-label="Team members"
      value={selected()}
      onValueChange={(next) => {
        setSelected(next)
        log(`${next.length} of ${people.length} selected`)
      }}
      allValues={people.map((person) => person.id)}
    >
      <table>
        <caption data-slot="visually-hidden">Team members</caption>
        <thead>
          <tr>
            <th>
              <Checkbox aria-label="Select all" parent>
                <CheckboxIndicator>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12h14" />
                  </svg>
                </CheckboxIndicator>
              </Checkbox>
            </th>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          <For each={people}>
            {(person) => (
              <tr>
                <td>
                  <Checkbox
                    value={person.id}
                    aria-label={`Select ${person.name}`}
                  >
                    <CheckboxIndicator>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </CheckboxIndicator>
                  </Checkbox>
                </td>
                <td>{person.name}</td>
                <td>{person.email}</td>
                <td>{person.role}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </CheckboxGroup>
  )
}

export { Example }
