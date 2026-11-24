import * as React from "react"
import { bindDrag, css, definePrimitive, live } from "@ui-sdk/core"
import {
  createVelocityTracker,
  rubberBand,
  solveSpring,
} from "@ui-sdk/core/gesture"
import { createParts } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

type InboxState = {
  pull: number
  refreshing: boolean
  refreshed: number
}

type InboxOptions = {
  onRelease?: (speed: number) => void
  onRefresh?: (count: number) => void
}

const hold = 48

const inbox = definePrimitive({
  name: "inbox",
  options: { onRelease: "callback", onRefresh: "callback" },
  state: (_options: InboxOptions): InboxState => ({
    pull: 0,
    refreshing: false,
    refreshed: 0,
  }),
  live: ["pull"],
  api: (context) => {
    const { store } = context
    const velocity = createVelocityTracker({ maxSpeed: 4 })
    let stop: (() => void) | undefined
    let frame = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    function springTo(to: number, speed: number) {
      cancelAnimationFrame(frame)
      const spring = solveSpring(0.35, 1, store.get().pull - to, speed)
      const start = performance.now()
      const tick = () => {
        const t = performance.now() - start
        const done = t > 800 || Math.abs(spring.position(t)) < 0.5
        store.set({ pull: done ? to : to + spring.position(t) })
        if (!done) {
          frame = requestAnimationFrame(tick)
        }
      }
      frame = requestAnimationFrame(tick)
    }

    function refresh(speed = 0) {
      store.set({ refreshing: true })
      springTo(hold, speed)
      timer = setTimeout(() => {
        const refreshed = store.get().refreshed + 1
        store.set({ refreshing: false, refreshed })
        context.options().onRefresh?.(refreshed)
        springTo(0, 0)
      }, 800)
    }

    context.onDestroy(() => {
      stop?.()
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    })
    return {
      refresh: () => !store.get().refreshing && refresh(),
      pointerdown(event: PointerEvent, el: HTMLElement) {
        if (event.button !== 0 || store.get().refreshing) {
          return
        }
        cancelAnimationFrame(frame)
        velocity.reset()
        const from = store.get().pull
        stop = bindDrag(el, event, {
          threshold: 4,
          onMove: ({ y, event: move }) => {
            const pulled = y - event.clientY + from
            const pull = rubberBand(pulled, el.clientHeight)
            velocity.add(move.timeStamp, pull)
            store.set({ pull })
          },
          onEnd: (end, canceled) => {
            stop = undefined
            const speed = canceled ? 0 : velocity.velocity(end.timeStamp)
            context.options().onRelease?.(speed)
            if (!canceled && (store.get().pull > hold || speed > 0.6)) {
              refresh(speed)
            } else {
              springTo(0, speed)
            }
          },
        })
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, { refreshing: boolean }>({
      state: (state) => ({ refreshing: state.refreshing }),
    }),
    list: slot({
      attrs: (state) => ({
        role: "list",
        "aria-busy": state.refreshing ? "true" : undefined,
      }),
      live: live<InboxState, any, {}>((state) => ({
        "data-pulling": state.pull > 0 ? "" : undefined,
        style: css({
          transform: `translateY(${state.pull}px)`,
          "touch-action": "none",
        }),
      })),
      on: { pointerdown: (event, { el, api }) => api.pointerdown(event, el!) },
    }),
    refresh: slot({
      attrs: () => ({ type: "button" }),
      press: ({ api }) => api.refresh(),
    }),
  }),
})

const parts = createParts(inbox, {
  root: "div",
  list: "div",
  refresh: "button",
})

const Inbox = parts.Root

const InboxList = parts.List

const InboxRefresh = parts.Refresh

const messages = [
  "Lunch on Friday?",
  "Your invoice is ready",
  "Design review notes",
  "Welcome aboard",
]

function Example() {
  const log = useLog()
  return (
    <Inbox
      onRelease={(speed) => log(`Let go at ${speed.toFixed(2)} px/ms`)}
      onRefresh={(count) =>
        log(`Refreshed ${count} ${count === 1 ? "time" : "times"}`)
      }
    >
      {({ refreshing }) => (
        <>
          <div data-slot="controls">
            <InboxRefresh data-size="sm">Refresh</InboxRefresh>
          </div>
          <div data-slot="gesture-frame">
            <p>{refreshing ? "Refreshing…" : "Pull to refresh"}</p>
            <InboxList aria-label="Inbox">
              {messages.map((message) => (
                <div key={message} role="listitem">
                  {message}
                </div>
              ))}
            </InboxList>
          </div>
        </>
      )}
    </Inbox>
  )
}

export {
  Example,
  inbox,
  Inbox,
  InboxList,
  type InboxOptions,
  InboxRefresh,
  type InboxState,
}
