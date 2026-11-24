import * as React from "react"
import {
  createChange,
  createSpans,
  definePrimitive,
  type ChangeDetails,
  type Span,
  type SpansDraft,
  type SpansReason,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type Booking = Span & { title: string }

type RoomsState = { bookings: Booking[]; draft: SpansDraft<Booking> | null }

type RoomsOptions = {
  defaultBookings: Booking[]
  onBookingsChange?: (
    bookings: Booking[],
    details: ChangeDetails<SpansReason>
  ) => void
}

const hour = (minutes: number) =>
  `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`

let booked = 0

const rooms = definePrimitive({
  name: "rooms",
  options: { defaultBookings: "value", onBookingsChange: "callback" },
  state: (options: RoomsOptions): RoomsState => ({
    bookings: options.defaultBookings,
    draft: null,
  }),
  api: (context) => {
    const change = createChange(context)
    return {
      spans: createSpans<RoomsState, Booking>(context, {
        key: "bookings",
        draft: "draft",
        set: (value, details) => change("bookings", value, details),
        axis: "x",
        min: () => 9 * 60,
        max: () => 17 * 60,
        step: () => 30,
        overlap: false,
        create: (span) => ({
          ...span,
          id: `booking-${++booked}`,
          title: "New",
        }),
        label: (booking) =>
          `${booking.title}, ${booking.track}, ${hour(booking.start)} to ${hour(booking.end)}`,
      }),
    }
  },
  slots: (slot) => ({
    root: slot<{}, { bookings: Booking[] }>({
      state: (state, { api }) => ({ bookings: api.spans.spans(state) }),
    }),
    room: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({
        role: "group",
        style: "position:relative;touch-action:none;user-select:none",
      }),
      on: {
        pointerdown: (event, { api, key }) =>
          api.spans.trackPointerdown(event, key),
      },
      bind: (el, { api, key }) => api.spans.bindTrack(el, key),
    }),
    booking: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { api, key }) => {
        const booking = api.spans.spans(state).find((other) => other.id === key)
        return {
          tabindex: "0",
          "aria-label": booking
            ? `${booking.title}, ${booking.track}, ${hour(booking.start)} to ${hour(booking.end)}`
            : undefined,
          ...api.spans.spanAttrs(state, key),
          style: booking ? api.spans.spanStyle(booking) : undefined,
        }
      },
      on: {
        pointerdown: (event, { api, key }) =>
          api.spans.spanPointerdown(event, key),
        keydown: (event, { api, key }) => api.spans.keydown(event, key),
      },
      bind: (el, { api, key }) => api.spans.bindSpan(el, key),
    }),
  }),
})

const parts = createParts(rooms, { root: "div", room: "div", booking: "div" })

const Rooms = parts.Root

const RoomsRoom = parts.Room

const RoomsBooking = parts.Booking

function Example() {
  return (
    <Rooms
      defaultBookings={[
        {
          id: "standup",
          track: "Atlas",
          start: 9 * 60 + 30,
          end: 11 * 60,
          title: "Standup",
        },
        {
          id: "review",
          track: "Birch",
          start: 13 * 60,
          end: 15 * 60,
          title: "Review",
        },
      ]}
    >
      {({ bookings }) => (
        <>
          <div data-slot="spans-lane">
            <span data-slot="spans-label" />
            <div data-slot="spans-axis" aria-hidden="true">
              <span>9:00</span>
              <span>13:00</span>
              <span>17:00</span>
            </div>
          </div>
          {["Atlas", "Birch"].map((room) => (
            <div key={room} data-slot="spans-lane">
              <span data-slot="spans-label">{room}</span>
              <RoomsRoom value={room} aria-label={room}>
                {bookings
                  .filter((booking) => booking.track === room)
                  .map((booking) => (
                    <RoomsBooking key={booking.id} value={booking.id}>
                      {booking.title}
                      <span data-span-edge="end" />
                    </RoomsBooking>
                  ))}
              </RoomsRoom>
            </div>
          ))}
        </>
      )}
    </Rooms>
  )
}

export { Example }
