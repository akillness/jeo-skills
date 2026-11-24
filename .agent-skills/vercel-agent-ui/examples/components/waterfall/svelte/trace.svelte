<script lang="ts">
  import { ChevronRightIcon } from "@lucide/svelte"
  import {
    createWaterfallController,
    visibleWaterfallRows,
    Waterfall,
    WaterfallAxis,
    WaterfallBar,
    WaterfallColumnHeader,
    WaterfallHeaderRow,
    WaterfallIndicator,
    WaterfallRow,
    WaterfallRowHeader,
    type WaterfallData,
  } from "@ui-sdk/svelte/waterfall"
  import { useLog } from "../../../shared/svelte/log"

  const trace: WaterfallData = [
    {
      value: "checkout",
      label: "POST /checkout",
      start: 0,
      duration: 920,
      children: [
        { value: "auth", label: "auth.verify", start: 12, duration: 64 },
        {
          value: "cart",
          label: "cart.load",
          start: 80,
          duration: 310,
          children: [
            {
              value: "cart-db",
              label: "db.query carts",
              start: 96,
              duration: 140,
            },
            {
              value: "prices",
              label: "pricing.quote",
              start: 240,
              duration: 136,
            },
          ],
        },
        {
          value: "payment",
          label: "payments.charge",
          start: 400,
          duration: 470,
          children: [
            { value: "fraud", label: "fraud.score", start: 410, duration: 120 },
            {
              value: "gateway",
              label: "gateway.capture",
              start: 540,
              duration: 310,
            },
          ],
        },
        { value: "email", label: "email.enqueue", start: 880, duration: 30 },
      ],
    },
  ]

  const log = useLog()
  const spans = createWaterfallController()
  let expanded = $state(["checkout"])
  let value: string | null = $state(null)
  const rows = $derived(visibleWaterfallRows(trace, expanded))
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => spans.expandAll()}>Expand All</button>
    <button type="button" onclick={() => spans.collapseAll()}>
      Collapse All
    </button>
  </div>
  <Waterfall
    aria-label="Checkout trace"
    items={trace}
    controller={spans}
    bind:expanded
    bind:value
    onValueChange={(next) => log(`Selected ${next}`)}
    format={{ style: "unit", unit: "millisecond", unitDisplay: "narrow" }}
  >
    <WaterfallHeaderRow>
      <WaterfallColumnHeader>Span</WaterfallColumnHeader>
      <WaterfallColumnHeader aria-label="Timeline">
        <WaterfallAxis />
      </WaterfallColumnHeader>
    </WaterfallHeaderRow>
    {#each rows as { item } (item.value)}
      <WaterfallRow value={item.value}>
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
