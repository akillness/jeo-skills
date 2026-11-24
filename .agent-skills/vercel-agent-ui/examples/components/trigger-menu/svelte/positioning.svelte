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

  let field: HTMLElement | undefined = $state()
</script>

<TriggerMenu triggers={[{ char: "@", items: people }]}>
  <Field
    {@attach (element) => {
      field = element
    }}
  >
    <FieldLabel>Comment</FieldLabel>
    <FieldControl>
      {#snippet render({ props })}
        <TriggerMenuInput {...props} placeholder="Type @ to mention someone…" />
      {/snippet}
    </FieldControl>
  </Field>
  <TriggerMenuContent
    side="top"
    align="start"
    sideOffset={8}
    alignOffset={-5}
    collisionPadding={16}
    anchor={field}
    container={field}
    keepMounted
  >
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
