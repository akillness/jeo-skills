<script lang="ts">
  import { untrack } from "svelte"
  import { Listbox, ListboxItem, ListboxItemIndicator } from "../../src/listbox"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from "../../src/select"

  // A long list whose items count their updates: an update is the part's
  // props changing, or a state key its snippet read changing. Odd items read
  // `highlighted`, so the highlight reaches them and no one else.
  let {
    n,
    kind,
    items: given,
    updated,
  }: {
    n: number
    kind: "select" | "listbox" | "data"
    items?: string[]
    updated: (key: string) => void
  } = $props()

  const items = $derived(
    given ??
      Array.from(
        { length: untrack(() => n) },
        (_, index) => `item-${index + 1}`
      )
  )
  const count = (key: string, ...reads: unknown[]) => (updated(key), "")
</script>

{#snippet option(value: string, index: number)}
  {#if index % 2}
    <SelectItem {value} label={value}>
      {#snippet render({ props, state })}
        <div {...props}>{count(value, props, state.highlighted)}{value}</div>
      {/snippet}
    </SelectItem>
  {:else}
    <SelectItem {value} label={value}>
      {#snippet render({ props })}
        <div {...props}>{count(value, props)}{value}</div>
      {/snippet}
    </SelectItem>
  {/if}
{/snippet}

{#if kind === "select"}
  <Select defaultValue={items[0]}>
    <SelectTrigger aria-label="Pick"><SelectValue /></SelectTrigger>
    <SelectContent>
      {#each items as value, index (value)}
        {@render option(value, index)}
      {/each}
    </SelectContent>
  </Select>
{:else if kind === "data"}
  <Select
    items={items.map((value) => ({ value, label: value }))}
    defaultValue={items[0]}
  >
    <SelectTrigger aria-label="Pick"><SelectValue /></SelectTrigger>
  </Select>
{:else}
  <Listbox multiple aria-label="Items">
    {#each items as value (value)}
      <ListboxItem {value}>
        {#snippet render({ props })}
          <div {...props}>
            {count(value, props)}{value}<ListboxItemIndicator
              >✓</ListboxItemIndicator
            >
          </div>
        {/snippet}
      </ListboxItem>
    {/each}
  </Listbox>
{/if}
