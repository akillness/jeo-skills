import * as React from "react"
import {
  createVirtualizer,
  css,
  definePrimitive,
  type VirtualItem,
} from "@ui-sdk/core"
import {
  createParts,
  mergeProps,
  renderElement,
  usePart,
  usePrimitive,
  type PartProps,
} from "@ui-sdk/react/primitive"

type LedgerOptions = {
  count: number
}

type LedgerRootState = {
  items: VirtualItem[]
}

type LedgerRowProps = { value: string; index: number; start: number }

const rowHeight = 32

const ledger = definePrimitive({
  name: "ledger",
  options: { count: "number" },
  state: (options: LedgerOptions) => ({ count: options.count }),
  sync: (options) => ({ count: options.count }),
  api: (context) => {
    const virtual = createVirtualizer({
      count: () => context.store.get().count,
      estimate: () => rowHeight,
    })
    context.onDestroy(context.store.subscribe(() => virtual.refresh()))
    return { virtual }
  },
  slots: (slot) => ({
    root: slot({
      attrs: () => ({ tabindex: "0", style: css({ overflow: "auto" }) }),
      bind: (el, { api }) => api.virtual.connect(el),
    }),
    body: slot({
      attrs: (state) => ({
        role: "list",
        style: css({
          position: "relative",
          height: `${state.count * rowHeight}px`,
        }),
      }),
    }),
    row: slot<LedgerRowProps>({
      props: { value: "string", index: "number", start: "number" },
      attrs: (state, { props }) => ({
        role: "listitem",
        "aria-setsize": String(state.count),
        "aria-posinset": String(props.index + 1),
        style: css({
          position: "absolute",
          top: "0",
          left: "0",
          right: "0",
          height: `${rowHeight}px`,
          transform: `translateY(${props.start}px)`,
        }),
      }),
    }),
  }),
})

const parts = createParts(ledger, { body: "div" })

function Ledger({
  count,
  className,
  style,
  children,
  render,
  ...props
}: LedgerOptions & PartProps<"div", LedgerRootState>) {
  const handle = usePrimitive(ledger, { count })
  const { virtual } = handle.api
  const items = React.useSyncExternalStore(
    virtual.subscribe,
    virtual.items,
    virtual.items
  )
  const own = { className, style, children }
  return usePart(
    handle,
    "root",
    {},
    {
      ...props,
      render: (merged) =>
        renderElement("div", mergeProps(own, merged), render, { items }),
    }
  )
}

const LedgerBody = parts.Body

function LedgerRow({
  item,
  ...props
}: { item: VirtualItem } & PartProps<"div">) {
  return usePart(
    ledger,
    "row",
    { value: item.key, index: item.index, start: item.start },
    props,
    "div"
  )
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})
const amount = (index: number) => ((index * 7919) % 100000) / 100

function Example() {
  return (
    <Ledger count={10000}>
      {({ items }) => (
        <>
          <LedgerBody aria-label="Ledger">
            {items.map((item) => (
              <LedgerRow key={item.key} item={item}>
                <span data-slot="hint">Entry {item.index + 1}</span>
                <span>{money.format(amount(item.index))}</span>
              </LedgerRow>
            ))}
          </LedgerBody>
          <p data-rendered={items.length} data-slot="output">
            {items.length} of 10,000 rows in the page
          </p>
        </>
      )}
    </Ledger>
  )
}

export {
  Example,
  ledger,
  Ledger,
  LedgerBody,
  LedgerRow,
  type LedgerOptions,
  type LedgerRootState,
  type LedgerRowProps,
}
