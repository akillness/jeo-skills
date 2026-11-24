<script lang="ts">
  import { ChevronRightIcon } from "@lucide/svelte"
  import {
    visibleWaterfallRows,
    Waterfall,
    WaterfallBar,
    WaterfallIndicator,
    WaterfallRow,
    WaterfallRowHeader,
    type WaterfallData,
  } from "@ui-sdk/svelte/waterfall"

  const trace: WaterfallData = Array.from({ length: 2000 }, (_, job) => ({
    value: `job-${job + 1}`,
    label: `job ${job + 1}`,
    start: job * 4,
    duration: 60,
    children: Array.from({ length: 4 }, (_, step) => ({
      value: `job-${job + 1}/step-${step + 1}`,
      label: `step ${step + 1}`,
      start: job * 4 + step * 15,
      duration: 15,
    })),
  }))

  const row = 32
  const height = 288

  let scroller: HTMLDivElement | undefined = $state()
  let scrollTop = $state(0)
  let expanded = $state(["job-1"])
  const rows = $derived(visibleWaterfallRows(trace, expanded))
  const start = $derived(Math.max(0, Math.floor(scrollTop / row) - 4))
  const end = $derived(
    Math.min(rows.length, Math.ceil((scrollTop + height) / row) + 4)
  )

  function onHighlight(_value: string, { index }: { index: number }) {
    const el = scroller
    if (!el) {
      return
    }
    const top = index * row
    if (top < el.scrollTop) {
      el.scrollTop = top
    } else if (top + row > el.scrollTop + el.clientHeight) {
      el.scrollTop = top + row - el.clientHeight
    }
    scrollTop = el.scrollTop
  }
</script>

<div
  data-slot="scroll"
  bind:this={scroller}
  onscroll={(event) => (scrollTop = event.currentTarget.scrollTop)}
>
  <Waterfall
    aria-label="Build trace"
    aria-rowcount={rows.length}
    items={trace}
    range={[0, 400]}
    bind:expanded
    {onHighlight}
    style="height: {rows.length * row}px"
  >
    {#each rows.slice(start, end) as { item, index } (item.value)}
      <WaterfallRow
        value={item.value}
        aria-rowindex={index + 1}
        style="top: {index * row}px"
      >
        <WaterfallRowHeader>
          {#if item.children}
            <WaterfallIndicator>
              <ChevronRightIcon aria-hidden="true" />
            </WaterfallIndicator>
          {/if}
          {item.label}
        </WaterfallRowHeader>
        <WaterfallBar />
      </WaterfallRow>
    {/each}
  </Waterfall>
</div>
