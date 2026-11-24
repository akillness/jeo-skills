"use client"

import * as React from "react"
import {
  Checkbox,
  CheckboxGroup,
  CheckboxIndicator,
} from "@ui-sdk/react/checkbox"
import { CheckIcon, MinusIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

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
  const [selected, setSelected] = React.useState(["hollis"])

  return (
    <CheckboxGroup
      aria-label="Team members"
      value={selected}
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
                  <CheckIcon aria-hidden="true" />
                  <MinusIcon aria-hidden="true" />
                </CheckboxIndicator>
              </Checkbox>
            </th>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.id}>
              <td>
                <Checkbox
                  value={person.id}
                  aria-label={`Select ${person.name}`}
                >
                  <CheckboxIndicator>
                    <CheckIcon aria-hidden="true" />
                  </CheckboxIndicator>
                </Checkbox>
              </td>
              <td>{person.name}</td>
              <td>{person.email}</td>
              <td>{person.role}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CheckboxGroup>
  )
}

export { Example }
