<script lang="ts">
  import { Field, FieldControl, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    type TriggerMenuDataItem,
    TriggerMenu,
    TriggerMenuContent,
    TriggerMenuEmpty,
    TriggerMenuInput,
    TriggerMenuItem,
    TriggerMenuList,
    TriggerMenuStatus,
  } from "@ui-sdk/svelte/trigger-menu"

  const people = [
    { value: "hollis", label: "Hollis Grant" },
    { value: "ines", label: "Inès Moreau" },
    { value: "kofi", label: "Kofi Mensah" },
    { value: "wren", label: "Wren Takahashi" },
    { value: "tomasz", label: "Tomasz Wójcik" },
  ]
</script>

<TriggerMenu triggers={[{ char: "@", type: "mention", items: people }]}>
  <Field>
    <FieldLabel>Message</FieldLabel>
    <FieldControl>
      {#snippet render({ props })}
        <TriggerMenuInput {...props} placeholder="Type @ to mention someone…" />
      {/snippet}
    </FieldControl>
  </Field>
  <div data-slot="visually-hidden">
    <TriggerMenuStatus />
  </div>
  <TriggerMenuContent>
    <TriggerMenuEmpty>No one found</TriggerMenuEmpty>
    <TriggerMenuList>
      {#snippet children(state)}
        {#each state.items as TriggerMenuDataItem[] as item (item.value)}
          <TriggerMenuItem value={item.value} label={item.label}>
            {item.label}
          </TriggerMenuItem>
        {/each}
      {/snippet}
    </TriggerMenuList>
  </TriggerMenuContent>
</TriggerMenu>
