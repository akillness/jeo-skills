<script lang="ts">
  import { Field, FieldControl, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    type TriggerMenuDataItem,
    TriggerMenu,
    TriggerMenuContent,
    TriggerMenuItem,
    TriggerMenuList,
    textFieldAdapter,
  } from "@ui-sdk/svelte/trigger-menu"

  const people = [
    { value: "hollis", label: "Hollis Grant" },
    { value: "ines", label: "Inès Moreau" },
    { value: "kofi", label: "Kofi Mensah" },
    { value: "wren", label: "Wren Takahashi" },
    { value: "tomasz", label: "Tomasz Wójcik" },
  ]

  let field: HTMLTextAreaElement | undefined = $state()
  const editor = $derived(field ? textFieldAdapter(field) : undefined)
</script>

<TriggerMenu {editor} triggers={[{ char: "@", items: people }]}>
  <Field>
    <FieldLabel>Notes</FieldLabel>
    <FieldControl>
      {#snippet render({ props })}
        <textarea
          bind:this={field}
          {...props}
          placeholder="Type @ to mention someone…"></textarea>
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
