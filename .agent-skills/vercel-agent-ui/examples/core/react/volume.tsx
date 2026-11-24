import * as React from "react"
import {
  createChange,
  createCommit,
  css,
  definePrimitive,
  type ChangeDetails,
  type CommitDetails,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

type Reason = "track-press" | "step-key"

type VolumeOptions = {
  defaultValue?: number
  onValueChange?: (value: number, details: ChangeDetails<Reason>) => void
  onValueCommit?: (value: number, details: CommitDetails<Reason>) => void
}

type VolumeState = { value: number }

const clamp = (value: number) => Math.round(Math.min(100, Math.max(0, value)))

const volume = definePrimitive({
  name: "volume",
  options: {
    defaultValue: "number",
    onValueChange: "callback",
    onValueCommit: "callback",
  },
  state: (options: VolumeOptions): VolumeState => ({
    value: options.defaultValue ?? 50,
  }),
  commits: ["value"],
  api: (context) => {
    const change = createChange(context)
    const commit = createCommit(context)
    const valueAt = (event: PointerEvent, track: HTMLElement) => {
      const rect = track.getBoundingClientRect()
      return clamp(((event.clientX - rect.left) / rect.width) * 100)
    }
    return {
      drag(event: PointerEvent, track: HTMLElement) {
        change("value", valueAt(event, track), { reason: "track-press", event })
      },
      release(event: PointerEvent) {
        commit("value", context.store.get().value, {
          reason: "track-press",
          event,
        })
      },
      step(event: KeyboardEvent) {
        const by = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5 }[
          event.key
        ]
        if (by === undefined) {
          return
        }
        event.preventDefault()
        const value = clamp(context.store.get().value + by)
        if (change("value", value, { reason: "step-key", event })) {
          commit("value", value, { reason: "step-key", event })
        }
      },
    }
  },
  slots: (slot) => ({
    track: slot({
      on: {
        pointerdown: (event, { el, api }) => {
          if (!el) {
            return
          }
          el.setPointerCapture(event.pointerId)
          el.querySelector<HTMLElement>("[role=slider]")?.focus()
          api.drag(event, el)
        },
        pointermove: (event, { el, api }) => {
          if (el?.hasPointerCapture(event.pointerId)) {
            api.drag(event, el)
          }
        },
        pointerup: (event, { api }) => api.release(event),
      },
    }),
    fill: slot({
      attrs: (state) => ({ style: css({ width: `${state.value}%` }) }),
    }),
    thumb: slot({
      attrs: (state) => ({
        role: "slider",
        tabindex: "0",
        "aria-valuemin": "0",
        "aria-valuemax": "100",
        "aria-valuenow": String(state.value),
        style: css({ left: `${state.value}%` }),
      }),
      on: { keydown: (event, { api }) => api.step(event) },
    }),
  }),
})

const parts = createParts(volume, { track: "div", fill: "div", thumb: "div" })

const Volume = parts.Root

const VolumeTrack = parts.Track

const VolumeFill = parts.Fill

const VolumeThumb = parts.Thumb

function Example() {
  const log = useLog()
  const [value, setValue] = React.useState(50)
  return (
    <div data-slot="stack">
      <p aria-hidden="true" data-slot="volume-label">
        <span>Volume</span>
        <span data-value>{value}</span>
      </p>
      <Volume
        onValueChange={setValue}
        onValueCommit={(saved) => log(`Saved ${saved}`)}
      >
        <VolumeTrack>
          <div data-slot="volume-rail">
            <VolumeFill />
          </div>
          <VolumeThumb aria-label="Volume" />
        </VolumeTrack>
      </Volume>
    </div>
  )
}

export {
  Example,
  volume,
  Volume,
  VolumeFill,
  VolumeThumb,
  VolumeTrack,
  type VolumeOptions,
  type VolumeState,
}
