import * as React from "react"
import {
  createVirtualizer,
  css,
  definePrimitive,
  type VirtualItem,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type StripState = { items: VirtualItem[]; size: number }

const dayWidth = 56

const strip = definePrimitive({
  name: "strip",
  state: (): StripState => ({ items: [], size: 0 }),
  api: (context) => {
    const virtual = createVirtualizer({
      count: () => 365,
      estimate: () => dayWidth,
      horizontal: true,
    })
    context.onDestroy(
      virtual.subscribe(() =>
        context.store.set({ items: virtual.items(), size: virtual.size() })
      )
    )
    return { virtual }
  },
  slots: (slot) => ({
    root: slot<{}, { items: VirtualItem[] }>({
      state: (state) => ({ items: state.items }),
      attrs: () => ({ tabindex: "0", style: css({ overflow: "auto" }) }),
      bind: (el, { api }) => api.virtual.connect(el),
    }),
    body: slot({
      attrs: (state) => ({
        role: "list",
        style: css({
          position: "relative",
          width: `${state.size}px`,
          height: "100%",
        }),
      }),
    }),
    day: slot<{ value: string; start: number }>({
      props: { value: "string", start: "number" },
      attrs: (_state, { props }) => ({
        role: "listitem",
        style: css({
          position: "absolute",
          top: "0",
          bottom: "0",
          left: "0",
          width: `${dayWidth}px`,
          transform: `translateX(${props.start}px)`,
        }),
      }),
    }),
  }),
})

const parts = createParts(strip, { root: "div", body: "div", day: "div" })

const Strip = parts.Root

const StripBody = parts.Body

const StripDay = parts.Day

const date = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

function Example() {
  return (
    <Strip>
      {({ items }) => (
        <StripBody aria-label="Days">
          {items.map((item) => (
            <StripDay key={item.key} value={item.key} start={item.start}>
              {date.format(Date.UTC(2026, 0, item.index + 1))}
            </StripDay>
          ))}
        </StripBody>
      )}
    </Strip>
  )
}

export { Example, strip, Strip, StripBody, StripDay, type StripState }
