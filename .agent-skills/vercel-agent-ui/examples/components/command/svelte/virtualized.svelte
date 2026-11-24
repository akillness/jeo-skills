<script lang="ts">
  import {
    Command,
    CommandInput,
    CommandItem,
    CommandList,
  } from "@ui-sdk/svelte/command"

  const commands = Array.from({ length: 10_000 }, (_, index) => ({
    value: `command-${index + 1}`,
    label: `Command ${index + 1}`,
  }))

  const row = 32
  const height = 256

  let scroller: HTMLDivElement | undefined = $state()
  let scrollTop = $state(0)

  function onValueChange(_value: string | null, { index }: { index: number }) {
    const el = scroller
    if (!el || index < 0) {
      return
    }
    const top = index * row
    if (top < el.scrollTop) {
      el.scrollTop = top
    } else if (top + row > el.scrollTop + el.clientHeight) {
      el.scrollTop = top + row - el.clientHeight
    }
  }

  function visible(items: typeof commands) {
    const start = Math.max(0, Math.floor(scrollTop / row) - 4)
    const end = Math.min(
      items.length,
      Math.ceil((scrollTop + height) / row) + 4
    )
    return items
      .slice(start, end)
      .map((item, offset) => ({ item, index: start + offset }))
  }
</script>

<Command items={commands} {onValueChange}>
  <CommandInput
    aria-label="Search 10,000 commands"
    placeholder="Search 10,000 commands…"
  />
  <div
    bind:this={scroller}
    onscroll={(event) => (scrollTop = event.currentTarget.scrollTop)}
  >
    <CommandList>
      {#snippet children(state)}
        <div style="height: {state.items.length * row}px">
          {#each visible(state.items as typeof commands) as { item, index } (item.value)}
            <CommandItem
              value={item.value}
              label={item.label}
              {index}
              style="top: {index * row}px"
            >
              {item.label}
            </CommandItem>
          {/each}
        </div>
      {/snippet}
    </CommandList>
  </div>
</Command>
