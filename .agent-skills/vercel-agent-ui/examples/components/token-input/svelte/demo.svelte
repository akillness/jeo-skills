<script lang="ts">
  import { XIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    TokenInput,
    TokenInputEditor,
    TokenInputToken,
    TokenInputTokenRemove,
  } from "@ui-sdk/svelte/token-input"
  import {
    type TriggerMenuDataItem,
    TriggerMenu,
    TriggerMenuContent,
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

<Field>
  <FieldLabel>Message</FieldLabel>
  <TokenInput>
    {#snippet token(token)}
      <TokenInputToken>
        {token.label}
        <TokenInputTokenRemove>
          <XIcon aria-hidden="true" />
        </TokenInputTokenRemove>
      </TokenInputToken>
    {/snippet}
    <TokenInputEditor placeholder="Type @ to mention someone…" />
    <TriggerMenu triggers={[{ char: "@", type: "mention", items: people }]}>
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
  </TokenInput>
</Field>
