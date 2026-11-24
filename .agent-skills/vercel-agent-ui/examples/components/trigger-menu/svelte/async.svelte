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

  const channels = [
    "announcements",
    "design",
    "design-reviews",
    "engineering",
    "general",
    "launches",
    "support",
  ]

  function searchChannels(query: string, { signal }: { signal: AbortSignal }) {
    return new Promise<{ value: string; label: string }[]>(
      (resolve, reject) => {
        const timer = setTimeout(
          () =>
            resolve(
              channels
                .filter((channel) => channel.includes(query.toLowerCase()))
                .map((channel) => ({ value: channel, label: channel }))
            ),
          600
        )
        signal.addEventListener("abort", () => {
          clearTimeout(timer)
          reject(signal.reason)
        })
      }
    )
  }
</script>

<TriggerMenu triggers={[{ char: "#", type: "channel", items: searchChannels }]}>
  <Field>
    <FieldLabel>Message</FieldLabel>
    <FieldControl>
      {#snippet render({ props })}
        <TriggerMenuInput {...props} placeholder="Type # to link a channel…" />
      {/snippet}
    </FieldControl>
  </Field>
  <TriggerMenuContent>
    <TriggerMenuStatus>
      {#snippet children(state)}
        {state.loading
          ? "Loading channels…"
          : state.count
            ? `${state.count} ${state.count === 1 ? "channel" : "channels"}`
            : ""}
      {/snippet}
    </TriggerMenuStatus>
    <TriggerMenuEmpty>
      {#snippet children(state)}
        {#if state.empty && !state.loading}No channels match “{state.query}”{/if}
      {/snippet}
    </TriggerMenuEmpty>
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
