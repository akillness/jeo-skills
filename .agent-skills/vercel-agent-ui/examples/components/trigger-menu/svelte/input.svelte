<script lang="ts">
  import { Field, FieldControl, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    type TriggerMenuDataItem,
    TriggerMenu,
    TriggerMenuContent,
    TriggerMenuInput,
    TriggerMenuItem,
    TriggerMenuList,
  } from "@ui-sdk/svelte/trigger-menu"

  const people = [
    { value: "hollis", label: "Hollis Grant" },
    { value: "ines", label: "Inès Moreau" },
    { value: "kofi", label: "Kofi Mensah" },
    { value: "wren", label: "Wren Takahashi" },
    { value: "tomasz", label: "Tomasz Wójcik" },
  ]
</script>

<TriggerMenu
  triggers={[{ char: "@", items: people }]}
  autoHighlight={false}
  loop={false}
>
  <Field>
    <FieldLabel>Task</FieldLabel>
    <FieldControl>
      {#snippet render({ props })}
        <TriggerMenuInput {...props} placeholder="Type @ to assign someone…">
          {#snippet render({ props })}
            <input {...props} />
          {/snippet}
        </TriggerMenuInput>
      {/snippet}
    </FieldControl>
  </Field>
  <TriggerMenuContent>
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
