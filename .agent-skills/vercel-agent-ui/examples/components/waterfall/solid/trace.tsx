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
} from "@ui-sdk/solid/waterfall"
import { createMemo, createSignal, For, Show } from "solid-js"
import { useLog } from "../../../shared/solid/log"

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

function Example() {
  const log = useLog()
  const spans = createWaterfallController()
  const [expanded, setExpanded] = createSignal(["checkout"])
  const [value, setValue] = createSignal<string | null>(null)
  const rows = createMemo(() => visibleWaterfallRows(trace, expanded()))
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => spans.expandAll()}>
          Expand All
        </button>
        <button type="button" onClick={() => spans.collapseAll()}>
          Collapse All
        </button>
      </div>
      <Waterfall
        aria-label="Checkout trace"
        items={trace}
        controller={spans}
        expanded={expanded()}
        onExpandedChange={setExpanded}
        value={value()}
        onValueChange={(next) => {
          setValue(next)
          log(`Selected ${next}`)
        }}
        format={{ style: "unit", unit: "millisecond", unitDisplay: "narrow" }}
      >
        <WaterfallHeaderRow>
          <WaterfallColumnHeader>Span</WaterfallColumnHeader>
          <WaterfallColumnHeader aria-label="Timeline">
            <WaterfallAxis />
          </WaterfallColumnHeader>
        </WaterfallHeaderRow>
        <For each={rows()} keyed={(row) => row.item.value}>
          {(row) => (
            <WaterfallRow value={row().item.value}>
              <WaterfallRowHeader>
                <Show when={row().item.children}>
                  <WaterfallIndicator>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </WaterfallIndicator>
                </Show>
                {row().item.label}
              </WaterfallRowHeader>
              <WaterfallBar />
            </WaterfallRow>
          )}
        </For>
      </Waterfall>
    </div>
  )
}

export { Example }
