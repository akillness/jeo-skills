<script lang="ts">
  import { ChevronDownIcon } from "@lucide/svelte"
  import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxLabel,
    ComboboxList,
    ComboboxTrigger,
  } from "@ui-sdk/svelte/combobox"

  const manyItems = Array.from({ length: 10_000 }, (_, index) => ({
    value: `item-${index + 1}`,
    label: `Item ${index + 1}`,
  }))

  function visibleRows(
    scrollTop: number,
    height: number,
    count: number,
    row: number
  ) {
    const start = Math.max(0, Math.floor(scrollTop / row) - 4)
    const end = Math.min(count, Math.ceil((scrollTop + height) / row) + 4)
    return { start, end }
  }

  function scrollForRow(
    index: number,
    scrollTop: number,
    height: number,
    row: number
  ) {
    const top = index * row
    if (top < scrollTop) {
      return top
    }
    if (top + row > scrollTop + height) {
      return top + row - height
    }
    return scrollTop
  }

  const row = 32
  const height = 288

  let scroller: HTMLDivElement | undefined = $state()
  let scrollTop = $state(0)

  function onHighlight(_value: unknown, { index }: { index: number }) {
    const el = scroller
    if (el && index >= 0) {
      el.scrollTop = scrollForRow(index, el.scrollTop, el.clientHeight, row)
    }
  }

  function visible(items: { value: string; label: string }[]) {
    const { start, end } = visibleRows(scrollTop, height, items.length, row)
    return items
      .slice(start, end)
      .map((item, offset) => ({ item, index: start + offset }))
  }
</script>

<Combobox items={manyItems} {onHighlight}>
  <div data-slot="stack">
    <ComboboxLabel>Item</ComboboxLabel>
    <div data-slot="row">
      <ComboboxInput placeholder="Search 10,000 items…" />
      <ComboboxTrigger aria-label="Show items">
        <ChevronDownIcon aria-hidden="true" />
      </ComboboxTrigger>
    </div>
  </div>
  <ComboboxContent>
    <ComboboxEmpty>No items found.</ComboboxEmpty>
    <div
      bind:this={scroller}
      onscroll={(event) => (scrollTop = event.currentTarget.scrollTop)}
    >
      <ComboboxList>
        {#snippet children(state)}
          <div style="height: {state.items.length * row}px">
            {#each visible(state.items as { value: string; label: string }[]) as { item, index } (item.value)}
              <ComboboxItem
                value={item.value}
                label={item.label}
                {index}
                style="top: {index * row}px; height: {row}px"
              >
                {item.label}
              </ComboboxItem>
            {/each}
          </div>
        {/snippet}
      </ComboboxList>
    </div>
  </ComboboxContent>
</Combobox>
