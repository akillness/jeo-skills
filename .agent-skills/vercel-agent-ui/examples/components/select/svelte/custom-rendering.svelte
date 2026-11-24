<script lang="ts">
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"

  const members = [
    { value: "hollis", name: "Hollis Grant", email: "hollis@example.com" },
    { value: "ines", name: "Inès Moreau", email: "ines@example.com" },
    { value: "kofi", name: "Kofi Mensah", email: "kofi@example.com" },
    { value: "wren", name: "Wren Takahashi", email: "wren@example.com" },
  ]
</script>

<Field>
  <FieldLabel>Reviewer</FieldLabel>
  <Select defaultValue="hollis">
    <SelectTrigger>
      {#snippet render({ props, state, children })}
        <button {...props}>
          {@render children?.(state)}
          <ChevronDownIcon />
        </button>
      {/snippet}
      <SelectValue>
        {#snippet children(state)}
          <span data-slot="badge">{state.label.slice(0, 1)}</span>
          {state.label}
        {/snippet}
      </SelectValue>
    </SelectTrigger>
    <SelectContent>
      {#each members as member (member.value)}
        <SelectItem
          value={member.value}
          label={member.name}
          disabled={member.value === "wren"}
        >
          {#snippet children(state)}
            <span data-slot="badge">{member.name.slice(0, 1)}</span>
            <span data-slot="stack">
              {member.name}
              <span data-slot="hint"
                >{state.disabled ? "Out of office" : member.email}</span
              >
            </span>
            <SelectItemIndicator>
              {#snippet render({ props, state: indicator })}
                <span {...props}>
                  {#if indicator.selected}
                    <CheckIcon />
                  {/if}
                </span>
              {/snippet}
            </SelectItemIndicator>
          {/snippet}
        </SelectItem>
      {/each}
    </SelectContent>
  </Select>
</Field>
