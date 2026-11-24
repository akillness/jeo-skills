import * as React from "react"
import {
  createChange,
  createUndoStack,
  createInlineEdit,
  createSpans,
  css,
  definePrimitive,
  matchesShortcut,
  stackSpans,
  type ChangeDetails,
  type Span,
  type SpanAction,
  type SpansDraft,
  type SpansReason,
} from "@ui-sdk/core"
import { createParts, usePart, type PartProps } from "@ui-sdk/react/primitive"

type CalendarEvent = Span & { title: string; tone?: string }

type WeekCalendarEventsChangeReason = SpansReason | "rename" | "undo" | "redo"

type WeekCalendarOptions = {
  events?: CalendarEvent[]
  defaultEvents?: CalendarEvent[]
  onEventsChange?: (
    events: CalendarEvent[],
    details: ChangeDetails<WeekCalendarEventsChangeReason>
  ) => void
  min?: number
  max?: number
  step?: number
  size?: number
  createEvent?: (span: Span) => CalendarEvent
}

type WeekCalendarState = {
  events: CalendarEvent[]
  draft: SpansDraft<CalendarEvent> | null
  editing: string | null
  canUndo: boolean
  canRedo: boolean
}

type WeekCalendarRootState = { events: CalendarEvent[] }
type WeekCalendarDayState = { events: CalendarEvent[] }
type WeekCalendarEventState = {
  event: CalendarEvent
  action: SpanAction | undefined
  editing: boolean
}
type WeekCalendarActionState = { disabled: boolean }

const formatTime = (minutes: number) =>
  `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`

let made = 0

const weekCalendar = /* @__PURE__ */ definePrimitive({
  name: "week-calendar",
  options: {
    events: "value",
    defaultEvents: "value",
    onEventsChange: "callback",
    min: "number",
    max: "number",
    step: "number",
    size: "number",
    createEvent: "value",
  },
  state: (options: WeekCalendarOptions): WeekCalendarState => ({
    events: options.events ?? options.defaultEvents ?? [],
    draft: null,
    editing: null,
    canUndo: false,
    canRedo: false,
  }),
  sync: (options) =>
    options.events === undefined ? {} : { events: options.events },
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const stack = createUndoStack(store.get().events)
    let recorded = store.get().events
    const eventElements = new Map<string, HTMLElement>()
    const syncStack = () =>
      store.set({ canUndo: stack.canUndo(), canRedo: stack.canRedo() })
    // Events set from outside start the history over, so undo never brings back older ones.
    const catchUp = () => {
      const current = store.get().events
      if (
        current !== recorded &&
        JSON.stringify(current) !== JSON.stringify(recorded)
      ) {
        stack.reset((recorded = current))
      }
    }
    const commit = (
      events: CalendarEvent[],
      details: { reason: WeekCalendarEventsChangeReason; event?: Event }
    ) => {
      catchUp()
      if (!change("events", events, details)) {
        return false
      }
      stack.record((recorded = events))
      syncStack()
      return true
    }
    const dayLabel = (day: string) =>
      context.props<{ label?: string }>("day", day)?.label ?? day
    const label = (event: CalendarEvent) =>
      `${event.title}, ${dayLabel(event.track)} ${formatTime(event.start)} to ${formatTime(event.end)}`

    const newId = () => {
      const taken = new Set(store.get().events.map((event) => event.id))
      let id = `event-${++made}`
      while (taken.has(id)) {
        id = `event-${++made}`
      }
      return id
    }
    const spans = createSpans<WeekCalendarState, CalendarEvent>(context, {
      key: "events",
      draft: "draft",
      set: (events, details) => {
        if (!commit(events, details)) {
          return false
        }
        if (details.action === "draw") {
          setTimeout(() => {
            eventElements.get(details.id)?.focus()
            edit.start(details.id)
          })
        }
        return true
      },
      min: () => context.options().min ?? 480,
      max: () => context.options().max ?? 1080,
      step: () => context.options().step ?? 15,
      size: () => context.options().size ?? 60,
      create: (span) =>
        context.options().createEvent?.(span) ?? {
          ...span,
          id: newId(),
          title: "New event",
        },
      label,
    })
    const edit = createInlineEdit<WeekCalendarState>(context, {
      key: "editing",
      value: (id) =>
        store.get().events.find((event) => event.id === id)?.title ?? "",
      commit: (id, text, details) =>
        !!text.trim() &&
        commit(
          store
            .get()
            .events.map((event) =>
              event.id === id ? { ...event, title: text.trim() } : event
            ),
          { reason: "rename", event: details.event }
        ),
    })
    const travel = (reason: "undo" | "redo", event?: Event) => {
      catchUp()
      const events = reason === "undo" ? stack.undo() : stack.redo()
      if (events && change("events", events, { reason, event })) {
        recorded = events
      } else if (events && reason === "undo") {
        stack.redo()
      } else if (events) {
        stack.undo()
      }
      syncStack()
    }

    const api = {
      spans,
      edit,
      label,
      undo: (event?: Event) => travel("undo", event),
      redo: (event?: Event) => travel("redo", event),
      bindDay: (el: HTMLElement, day: string) => spans.bindTrack(el, day),
      bindEvent(el: HTMLElement, id: string) {
        eventElements.set(id, el)
        const unbind = spans.bindSpan(el, id)
        return () => {
          if (eventElements.get(id) === el) {
            eventElements.delete(id)
          }
          unbind()
        }
      },
      eventKeydown(event: KeyboardEvent, id: string) {
        if (store.get().editing) {
          return
        }
        if (!spans.keydown(event, id)) {
          edit.keydown(event, id)
        }
      },
      rootKeydown(event: KeyboardEvent) {
        if (store.get().draft || store.get().editing) {
          return
        }
        if (matchesShortcut(event, "mod+z")) {
          api.undo(event)
        } else if (
          matchesShortcut(event, "mod+shift+z") ||
          matchesShortcut(event, "control+y")
        ) {
          api.redo(event)
        } else {
          return
        }
        event.preventDefault()
      },
    }
    return api
  },
  slots: (slot) => ({
    root: slot<{}, WeekCalendarRootState>({
      state: (state, { api }) => ({ events: api.spans.spans(state) }),
      attrs: (_state, { id }) => ({ "aria-describedby": `${id}-instructions` }),
      on: { keydown: (event, { api }) => api.rootKeydown(event) },
    }),
    day: slot<{ value: string; label: string }, WeekCalendarDayState>({
      props: { value: "string", label: "string" },
      state: (state, { api, key }) => ({
        events: api.spans.spansOn(state, key),
      }),
      attrs: (_state, { props }) => ({
        role: "group",
        "aria-label": props.label,
        style: css({ position: "relative", "touch-action": "pan-y" }),
      }),
      bind: (el, { api, key }) => api.bindDay(el, key),
      on: {
        pointerdown: (event, { api, key }) =>
          api.spans.trackPointerdown(event, key),
      },
    }),
    event: slot<{ value: string }, WeekCalendarEventState>({
      props: { value: "string" },
      present: (state, { api, key }) =>
        api.spans.spans(state).some((event) => event.id === key),
      state: (state, { api, key }) => ({
        event: api.spans.spans(state).find((event) => event.id === key)!,
        action: api.spans.action(state, key),
        editing: state.editing === key,
      }),
      attrs: (state, { api, key }) => {
        const events = api.spans.spans(state)
        const event = events.find((other) => other.id === key)!
        const lanes = stackSpans(
          events.filter((other) => other.track === event.track)
        )
        return {
          ...api.spans.spanAttrs(state, key),
          role: "button",
          tabindex: "0",
          "aria-roledescription": "event",
          "aria-label": api.label(event),
          style: `${api.spans.spanStyle(event, lanes.get(key))};touch-action:none`,
        }
      },
      bind: (el, { api, key }) => api.bindEvent(el, key),
      on: {
        pointerdown: (event, { api, key }) =>
          api.spans.spanPointerdown(event, key),
        keydown: (event, { api, key }) => api.eventKeydown(event, key),
        dblclick: (event, { api, key }) => api.edit.dblclick(event, key),
      },
    }),
    "event-edge": slot<{ edge: "start" | "end" }>({
      props: { edge: "string" },
      attrs: (_state, { props }) => ({
        "data-span-edge": props.edge,
        "aria-hidden": "true",
      }),
    }),
    "event-input": slot<{ value: string }>({
      props: { value: { kind: "string", from: "event" } },
      present: (state, { key }) => state.editing === key,
      attrs: () => ({ "aria-label": "Event title" }),
      on: {
        keydown: (event, { api }) => api.edit.inputKeydown(event),
        focusout: (event, { api }) => api.edit.end("focus-out", event),
        pointerdown: (event) => event.stopPropagation(),
      },
      bind: (el, { api }) => api.edit.bindInput(el as HTMLInputElement),
    }),
    undo: slot<{}, WeekCalendarActionState>({
      state: (state) => ({ disabled: !state.canUndo }),
      attrs: (state) => ({
        type: "button",
        disabled: state.canUndo ? undefined : "",
      }),
      press: ({ api }, event) => api.undo(event),
    }),
    redo: slot<{}, WeekCalendarActionState>({
      state: (state) => ({ disabled: !state.canRedo }),
      attrs: (state) => ({
        type: "button",
        disabled: state.canRedo ? undefined : "",
      }),
      press: ({ api }, event) => api.redo(event),
    }),
    instructions: slot({
      attrs: (_state, { id }) => ({ id: `${id}-instructions`, hidden: "" }),
    }),
  }),
})

const parts = createParts(weekCalendar, {
  root: "div",
  day: "div",
  "event-edge": "div",
  undo: "button",
  redo: "button",
  instructions: "div",
})

const EventContext = React.createContext<string | null>(null)

const WeekCalendar = parts.Root

const WeekCalendarDay = parts.Day

function WeekCalendarEvent({
  value,
  ...props
}: { value: string } & PartProps<"div", WeekCalendarEventState>) {
  return (
    <EventContext.Provider value={value}>
      {usePart(weekCalendar, "event", { value }, props)}
    </EventContext.Provider>
  )
}

const WeekCalendarEventEdge = parts.EventEdge

function WeekCalendarEventInput(props: PartProps<"input">) {
  const value = React.useContext(EventContext)
  if (value === null) {
    throw new Error(
      "WeekCalendarEventInput must be used inside <WeekCalendarEvent>."
    )
  }
  return usePart(weekCalendar, "event-input", { value }, props, "input")
}

const WeekCalendarUndo = parts.Undo

const WeekCalendarRedo = parts.Redo

const WeekCalendarInstructions = parts.Instructions

const days = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
]

const tones = {
  sky: "#0ea5e9",
  violet: "#8b5cf6",
  emerald: "#10b981",
  amber: "#f59e0b",
}

const defaultEvents: CalendarEvent[] = [
  {
    id: "e1",
    track: "mon",
    start: 540,
    end: 570,
    title: "Standup",
    tone: "sky",
  },
  {
    id: "e2",
    track: "mon",
    start: 600,
    end: 690,
    title: "Design review",
    tone: "violet",
  },
  {
    id: "e3",
    track: "mon",
    start: 630,
    end: 720,
    title: "1:1 with Sam",
    tone: "emerald",
  },
  {
    id: "e4",
    track: "tue",
    start: 540,
    end: 570,
    title: "Standup",
    tone: "sky",
  },
  {
    id: "e5",
    track: "tue",
    start: 780,
    end: 900,
    title: "Focus time",
    tone: "amber",
  },
  {
    id: "e6",
    track: "wed",
    start: 540,
    end: 570,
    title: "Standup",
    tone: "sky",
  },
  {
    id: "e7",
    track: "wed",
    start: 840,
    end: 900,
    title: "Ship primitives",
    tone: "violet",
  },
  {
    id: "e8",
    track: "thu",
    start: 660,
    end: 750,
    title: "Workshop",
    tone: "emerald",
  },
  {
    id: "e9",
    track: "fri",
    start: 540,
    end: 570,
    title: "Standup",
    tone: "sky",
  },
  {
    id: "e10",
    track: "fri",
    start: 960,
    end: 1020,
    title: "Demo day",
    tone: "violet",
  },
]

const min = 8 * 60
const max = 18 * 60
const hour = 48

function Example() {
  return (
    <WeekCalendar
      defaultEvents={defaultEvents}
      min={min}
      max={max}
      aria-label="Week"
    >
      <div data-slot="row">
        <WeekCalendarUndo>Undo</WeekCalendarUndo>
        <WeekCalendarRedo>Redo</WeekCalendarRedo>
        <span data-slot="hint">Drag a day to add an event.</span>
      </div>
      <div data-slot="week-calendar-frame">
        <div data-slot="week-calendar-head">
          <span />
          {days.map((day) => (
            <span key={day.value} aria-hidden="true">
              {day.label.slice(0, 3)}
            </span>
          ))}
        </div>
        <div data-slot="scroll">
          <div
            data-slot="week-calendar-body"
            style={
              {
                "--hour": `${hour}px`,
                height: ((max - min) / 60) * hour,
              } as React.CSSProperties
            }
          >
            <div aria-hidden="true" data-slot="week-calendar-gutter">
              {Array.from({ length: (max - min) / 60 }, (_, i) => (
                <span key={i} style={{ top: i * hour }}>
                  {formatTime(min + i * 60)}
                </span>
              ))}
            </div>
            {days.map((day) => (
              <WeekCalendarDay
                key={day.value}
                value={day.value}
                label={day.label}
              >
                {({ events }) =>
                  events.map((event) => (
                    <WeekCalendarEvent
                      key={event.id}
                      value={event.id}
                      style={
                        {
                          "--tone":
                            tones[
                              (event.tone as keyof typeof tones) ?? "sky"
                            ] ?? tones.sky,
                        } as React.CSSProperties
                      }
                    >
                      {({ editing }) => (
                        <>
                          <WeekCalendarEventEdge edge="start" />
                          {editing ? (
                            <WeekCalendarEventInput />
                          ) : (
                            <span>{event.title}</span>
                          )}
                          <span data-slot="hint">
                            {formatTime(event.start)} – {formatTime(event.end)}
                          </span>
                          <WeekCalendarEventEdge edge="end" />
                        </>
                      )}
                    </WeekCalendarEvent>
                  ))
                }
              </WeekCalendarDay>
            ))}
          </div>
        </div>
      </div>
      <WeekCalendarInstructions>
        Up and Down move an event 15 minutes, Shift with Up and Down changes its
        length, Left and Right move it to another day, Enter renames it and
        Delete removes it. Control or Command with Z undoes.
      </WeekCalendarInstructions>
    </WeekCalendar>
  )
}

export {
  type CalendarEvent,
  Example,
  formatTime,
  weekCalendar,
  WeekCalendar,
  type WeekCalendarActionState,
  WeekCalendarDay,
  type WeekCalendarDayState,
  WeekCalendarEvent,
  WeekCalendarEventEdge,
  WeekCalendarEventInput,
  type WeekCalendarEventsChangeReason,
  type WeekCalendarEventState,
  WeekCalendarInstructions,
  type WeekCalendarOptions,
  WeekCalendarRedo,
  type WeekCalendarRootState,
  WeekCalendarUndo,
}
