<script lang="ts">
  import { Field, FieldControl, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    type TriggerMenuDataItem,
    TriggerMenu,
    TriggerMenuContent,
    TriggerMenuInput,
    TriggerMenuItem,
    TriggerMenuList,
    createTriggerMenuController,
  } from "@ui-sdk/svelte/trigger-menu"
  import { useLog } from "../../../shared/svelte/log"

  const people = [
    { value: "hollis", label: "Hollis Grant" },
    { value: "ines", label: "Inès Moreau" },
    { value: "kofi", label: "Kofi Mensah" },
    { value: "wren", label: "Wren Takahashi" },
    { value: "tomasz", label: "Tomasz Wójcik" },
  ]

  const log = useLog()
  const menu = createTriggerMenuController()

  async function mention() {
    const closed = await menu.open({ trigger: "@" })
    log(`Closed (${closed.reason})`)
  }
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button
      type="button"
      onmousedown={(event) => event.preventDefault()}
      onclick={mention}>Mention</button
    >
    <button
      type="button"
      onmousedown={(event) => event.preventDefault()}
      onclick={() =>
        menu.insert(
          new Date().toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
          })
        )}
    >
      Insert Date
    </button>
  </div>
  <TriggerMenu controller={menu} triggers={[{ char: "@", items: people }]}>
    <Field>
      <FieldLabel>Message</FieldLabel>
      <FieldControl>
        {#snippet render({ props })}
          <TriggerMenuInput {...props} placeholder="Write a message…" />
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
</div>
