<script lang="ts">
  import { UsersIcon } from "@lucide/svelte"
  import { Field, FieldControl, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    TriggerMenu,
    TriggerMenuContent,
    TriggerMenuGroup,
    TriggerMenuGroupLabel,
    TriggerMenuInput,
    TriggerMenuItem,
    TriggerMenuItemIcon,
    TriggerMenuList,
    TriggerMenuSeparator,
  } from "@ui-sdk/svelte/trigger-menu"

  const people = [
    { value: "hollis", label: "Hollis Grant" },
    { value: "ines", label: "Inès Moreau" },
    { value: "kofi", label: "Kofi Mensah" },
    { value: "wren", label: "Wren Takahashi" },
    { value: "tomasz", label: "Tomasz Wójcik", disabled: true },
  ]
</script>

<TriggerMenu
  triggers={[
    {
      char: "@",
      spaces: 2,
      maxLength: 30,
      pattern: /[\p{L}.'-]/u,
      filter: "startsWith",
      insert: (item) => `@${item.label.split(" ")[0]} `,
    },
  ]}
>
  <Field>
    <FieldLabel>Message</FieldLabel>
    <FieldControl>
      {#snippet render({ props })}
        <TriggerMenuInput {...props} placeholder="Type @ and a first name…" />
      {/snippet}
    </FieldControl>
  </Field>
  <TriggerMenuContent>
    <TriggerMenuList>
      <TriggerMenuGroup>
        <TriggerMenuGroupLabel>People</TriggerMenuGroupLabel>
        {#each people as person (person.value)}
          <TriggerMenuItem
            value={person.value}
            label={person.label}
            disabled={person.disabled}
          >
            {person.label}
            <span data-slot="hint"
              >{person.disabled ? "Deactivated" : `@${person.value}`}</span
            >
          </TriggerMenuItem>
        {/each}
      </TriggerMenuGroup>
      <TriggerMenuSeparator />
      <TriggerMenuItem
        value="here"
        label="here"
        keywords={["everyone", "channel"]}
        onSelect={(value, details) => details.insert("@here ")}
      >
        <TriggerMenuItemIcon>
          <UsersIcon />
        </TriggerMenuItemIcon>
        Notify everyone here
      </TriggerMenuItem>
    </TriggerMenuList>
  </TriggerMenuContent>
</TriggerMenu>
