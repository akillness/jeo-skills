import * as React from "react"
import {
  createChange,
  createSpans,
  css,
  definePrimitive,
  stackSpans,
  type Span,
  type SpanAction,
  type SpansDraft,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

type Plan = Span & { title: string }

type WeekState = {
  plans: Plan[]
  draft: SpansDraft<Plan> | null
  hover: number | null
}

const time = (minutes: number) =>
  `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`

let made = 0

const week = definePrimitive({
  name: "week",
  options: { onHover: "callback" },
  state: (_options: {
    onHover?: (day: string, minutes: number) => void
  }): WeekState => ({
    plans: [
      { id: "gym", track: "Mon", start: 9 * 60, end: 10 * 60, title: "Gym" },
      {
        id: "call",
        track: "Mon",
        start: 9 * 60 + 30,
        end: 11 * 60,
        title: "Call",
      },
      {
        id: "lunch",
        track: "Tue",
        start: 12 * 60,
        end: 13 * 60,
        title: "Lunch",
      },
    ],
    draft: null,
    hover: null,
  }),
  api: (context) => {
    const change = createChange(context)
    const spans = createSpans<WeekState, Plan>(context, {
      key: "plans",
      draft: "draft",
      set: (value, details) => change("plans", value, details),
      min: () => 8 * 60,
      max: () => 14 * 60,
      step: () => 30,
      minSize: () => 60,
      maxSize: () => 180,
      size: () => 60,
      tracks: () => ["Mon", "Tue", "Wed"],
      create: (span) => ({ ...span, id: `plan-${++made}`, title: "New" }),
      label: (plan) =>
        `${plan.title}, ${plan.track} ${time(plan.start)} to ${time(plan.end)}`,
      createAutoScroll: { edge: 32 },
    })
    return {
      spans,
      hover: (track: string | null, event?: PointerEvent) => {
        const hover =
          track && event
            ? spans.valueAt(track, event.clientX, event.clientY)
            : null
        if (hover === context.store.get().hover) {
          return
        }
        context.store.set({ hover })
        if (track && hover !== null) {
          context.options().onHover?.(track, hover)
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot({}),
    day: slot<{ value: string }, { plans: Plan[] }>({
      props: { value: "string" },
      state: (state, { api, key }) => ({
        plans: api.spans.spansOn(state, key),
      }),
      attrs: () => ({
        role: "group",
        style: "position:relative;touch-action:none;user-select:none",
      }),
      on: {
        pointerdown: (event, { api, key }) =>
          api.spans.trackPointerdown(event, key),
        pointermove: (event, { api, key }) => api.hover(key, event),
        pointerleave: (_event, { api }) => api.hover(null),
      },
      bind: (el, { api, key }) => api.spans.bindTrack(el, key),
    }),
    plan: slot<
      { value: string },
      { plan: Plan; action: SpanAction | undefined }
    >({
      props: { value: "string" },
      present: (state, { api, key }) =>
        api.spans.spans(state).some((plan) => plan.id === key),
      state: (state, { api, key }) => ({
        plan: api.spans.spans(state).find((plan) => plan.id === key)!,
        action: api.spans.action(state, key),
      }),
      attrs: (state, { api, key }) => {
        const plans = api.spans.spans(state)
        const plan = plans.find((other) => other.id === key)!
        const lanes = stackSpans(
          plans.filter((other) => other.track === plan.track)
        )
        return {
          tabindex: "0",
          "aria-label": `${plan.title}, ${plan.track} ${time(plan.start)} to ${time(plan.end)}`,
          ...api.spans.spanAttrs(state, key),
          style: api.spans.spanStyle(plan, lanes.get(key)),
        }
      },
      on: {
        pointerdown: (event, { api, key }) =>
          api.spans.spanPointerdown(event, key),
        keydown: (event, { api, key }) => api.spans.keydown(event, key),
      },
      bind: (el, { api, key }) => api.spans.bindSpan(el, key),
    }),
    edge: slot<{ edge: "start" | "end" }>({
      props: { edge: "string" },
      attrs: (_state, { props }) => ({
        "data-span-edge": props.edge,
        style: css({
          position: "absolute",
          left: "0",
          right: "0",
          height: "6px",
          cursor: "ns-resize",
        }),
      }),
    }),
  }),
})

const parts = createParts(week, {
  root: "div",
  day: "div",
  plan: "div",
  edge: "div",
})

const Week = parts.Root

const WeekDay = parts.Day

const WeekPlan = parts.Plan

const WeekEdge = parts.Edge

function Example() {
  const log = useLog()
  return (
    <Week onHover={(day, minutes) => log(`Pointer at ${day} ${time(minutes)}`)}>
      <div data-slot="spans-week-head">
        {["Mon", "Tue", "Wed"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div data-slot="spans-week-frame">
        <div data-slot="spans-week-hours">
          {[8, 9, 10, 11, 12, 13].map((hour) => (
            <div key={hour}>{hour}:00</div>
          ))}
        </div>
        {["Mon", "Tue", "Wed"].map((day) => (
          <WeekDay key={day} value={day} aria-label={day}>
            {({ plans }) =>
              plans.map((plan) => (
                <WeekPlan key={plan.id} value={plan.id}>
                  {({ plan, action }) => (
                    <>
                      <WeekEdge edge="start" />
                      {plan.title}
                      {action && ` ${time(plan.start)}–${time(plan.end)}`}
                      <WeekEdge edge="end" />
                    </>
                  )}
                </WeekPlan>
              ))
            }
          </WeekDay>
        ))}
      </div>
    </Week>
  )
}

export { Example }
