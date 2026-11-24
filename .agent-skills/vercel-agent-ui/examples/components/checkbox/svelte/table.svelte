<script lang="ts">
  import { CheckIcon, MinusIcon } from "@lucide/svelte"
  import {
    Checkbox,
    CheckboxGroup,
    CheckboxIndicator,
  } from "@ui-sdk/svelte/checkbox"
  import { useLog } from "../../../shared/svelte/log"

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

  const log = useLog()
  let selected = $state(["hollis"])
</script>

<CheckboxGroup
  bind:value={selected}
  aria-label="Team members"
  onValueChange={(next) => log(`${next.length} of ${people.length} selected`)}
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
      {#each people as person (person.id)}
        <tr>
          <td>
            <Checkbox value={person.id} aria-label={`Select ${person.name}`}>
              <CheckboxIndicator>
                <CheckIcon aria-hidden="true" />
              </CheckboxIndicator>
            </Checkbox>
          </td>
          <td>{person.name}</td>
          <td>{person.email}</td>
          <td>{person.role}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</CheckboxGroup>
