import * as React from "react"
import { bindDrag, dragThreshold } from "@ui-sdk/core"
import { scrubTo, stepBy, stepFromKey } from "@ui-sdk/core/number"

const tabs = {
  inbox: "Inbox",
  drafts: "Drafts",
  sent: "Sent",
  spam: "Spam",
}

const counts: Record<string, string> = {
  inbox: "12 conversations, 3 unread",
  drafts: "2 drafts",
  sent: "48 conversations",
  spam: "No spam",
}

type Key = keyof typeof tabs

const gap = 4

type Drag = {
  key: Key
  left: number
  target: number
  others: Key[]
  widths: Record<string, number>
}

const insert = (others: Key[], key: Key, at: number) => [
  ...others.slice(0, at),
  key,
  ...others.slice(at),
]

const nearest = (points: number[], value: number) =>
  points.reduce(
    (best, point, index) =>
      Math.abs(point - value) < Math.abs(points[best] - value) ? index : best,
    0
  )

const lefts = (order: Key[], widths: Record<string, number>) =>
  order.reduce<number[]>(
    (all, key, index) => [
      ...all,
      index ? all[index - 1] + widths[order[index - 1]] + gap : 0,
    ],
    []
  )

function Example() {
  const [order, setOrder] = React.useState(Object.keys(tabs) as Key[])
  const [selected, setSelected] = React.useState<Key>("inbox")
  const [drag, setDrag] = React.useState<Drag | null>(null)
  const elements = React.useRef(new Map<Key, HTMLButtonElement>())
  const stop = React.useRef<(() => void) | undefined>(undefined)
  React.useEffect(() => () => stop.current?.(), [])

  const pointerdown = (
    event: React.PointerEvent<HTMLButtonElement>,
    key: Key
  ) => {
    if (event.button !== 0) {
      return
    }
    const widths = Object.fromEntries(
      order.map((candidate) => [
        candidate,
        elements.current.get(candidate)!.getBoundingClientRect().width,
      ])
    )
    const others = order.filter((candidate) => candidate !== key)
    const slots = lefts([...others, key], widths)
    const start = slots[order.indexOf(key)] - event.clientX
    let latest: Drag | null = null
    stop.current?.()
    stop.current = bindDrag(event.currentTarget, event.nativeEvent, {
      threshold: dragThreshold,
      cancelOnEscape: true,
      onMove: ({ x, event }) => {
        const { value: left } = scrubTo(
          start + x,
          {
            min: 0,
            max: slots[slots.length - 1],
            step: 1,
            snap: { points: slots, threshold: 12 },
          },
          { snap: !(event.metaKey || event.ctrlKey) }
        )
        latest = { key, left, target: nearest(slots, left), others, widths }
        setDrag(latest)
      },
      onEnd: (_end, canceled) => {
        stop.current = undefined
        if (latest && !canceled) {
          setOrder(insert(latest.others, latest.key, latest.target))
        }
        setDrag(null)
      },
    })
  }

  const keydown = (event: React.KeyboardEvent<HTMLButtonElement>, key: Key) => {
    const move = stepFromKey(event, { arrows: "horizontal" })
    if (!move) {
      return
    }
    event.preventDefault()
    const index = stepBy(order.indexOf(key), move, {
      min: 0,
      max: order.length - 1,
      step: 1,
    })
    if (event.altKey) {
      setOrder(
        insert(
          order.filter((candidate) => candidate !== key),
          key,
          index
        )
      )
      return
    }
    setSelected(order[index])
    elements.current.get(order[index])?.focus()
  }

  const shown = drag ? insert(drag.others, drag.key, drag.target) : order
  const placed = drag ? lefts(shown, drag.widths) : []
  return (
    <div data-slot="stack">
      <div
        role="tablist"
        aria-label="Mailboxes"
        data-slot="drag-tabs-list"
        data-dragging={drag ? "" : undefined}
        style={
          drag
            ? ({
                "--drag-tabs-width": `${placed[placed.length - 1] + drag.widths[shown[shown.length - 1]] + 4}px`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {shown.map((key, index) => (
          <button
            key={key}
            ref={(el) => {
              if (el) {
                elements.current.set(key, el)
              } else {
                elements.current.delete(key)
              }
            }}
            type="button"
            role="tab"
            id={`mailbox-${key}`}
            data-slot="drag-tabs-tab"
            aria-selected={key === selected}
            aria-controls="mailbox-panel"
            tabIndex={key === selected ? 0 : -1}
            data-moving={drag?.key === key || undefined}
            onPointerDown={(event) => pointerdown(event, key)}
            onKeyDown={(event) => keydown(event, key)}
            onClick={() => setSelected(key)}
            style={
              drag
                ? ({
                    "--drag-tabs-left": `${(drag.key === key ? drag.left : placed[index]) + 2}px`,
                  } as React.CSSProperties)
                : undefined
            }
          >
            {tabs[key]}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="mailbox-panel"
        data-slot="drag-tabs-panel"
        aria-labelledby={`mailbox-${selected}`}
      >
        <h3>{tabs[selected]}</h3>
        <span data-slot="hint">{counts[selected]}</span>
      </div>
    </div>
  )
}

export { Example }
