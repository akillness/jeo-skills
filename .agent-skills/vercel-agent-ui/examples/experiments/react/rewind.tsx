import * as React from "react"
import { definePrimitive } from "@ui-sdk/core"
import { createAgent } from "@ui-sdk/react/agent"
import { createParts, usePart, type PartProps } from "@ui-sdk/react/primitive"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/react/radio"
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
} from "@ui-sdk/react/slider"
import { Switch, SwitchThumb } from "@ui-sdk/react/switch"
import {
  createHistory,
  describeEntry,
  type HistoryEntry,
} from "@ui-sdk/react/history"

type RewindOptions = {
  agent: ReturnType<typeof createAgent>
}

type RewindState = { entries: readonly HistoryEntry[]; position: number }

type RewindRootState = {
  entries: readonly HistoryEntry[]
  position: number
  current: HistoryEntry | undefined
}
type RewindStepState = { entry: HistoryEntry | undefined; applied: boolean }
type RewindUndoState = { disabled: boolean }

const undoable = (state: RewindState, source: string) =>
  state.entries
    .slice(0, state.position)
    .some((entry) => entry.source === source && !entry.reverted)

const rewind = /* @__PURE__ */ definePrimitive({
  name: "rewind",
  options: { agent: "value" },
  state: (_options: RewindOptions): RewindState => ({
    entries: [],
    position: 0,
  }),
  api: (context) => {
    const { store } = context
    let history: ReturnType<typeof createHistory> | undefined
    const api = {
      seek: (to: number) => history?.seek(to),
      undoSource: (source: string) => history?.undoSource(source),
      record(el: HTMLElement) {
        const made = createHistory(context.options().agent, { within: el })
        history = made
        const sync = () =>
          store.set({ entries: made.entries(), position: made.position() })
        sync()
        const unsubscribe = made.subscribe(sync)
        return () => {
          unsubscribe()
          made.destroy()
          if (history === made) {
            history = undefined
          }
        }
      },
      scrubberKeydown(event: KeyboardEvent) {
        const { entries, position } = store.get()
        const to = {
          ArrowLeft: position - 1,
          ArrowRight: position + 1,
          Home: 0,
          End: entries.length,
        }[event.key]
        if (to === undefined) {
          return
        }
        event.preventDefault()
        void api.seek(to)
      },
    }
    return api
  },
  slots: (slot) => ({
    root: slot<{}, RewindRootState>({
      state: (state) => ({
        entries: state.entries,
        position: state.position,
        current: state.entries[state.position - 1],
      }),
    }),
    panel: slot({ bind: (el, { api }) => api.record(el) }),
    scrubber: slot({
      attrs: (state) => {
        const current = state.entries[state.position - 1]
        return {
          role: "slider",
          tabindex: "0",
          "aria-valuemin": "0",
          "aria-valuemax": String(state.entries.length),
          "aria-valuenow": String(state.position),
          "aria-valuetext": current
            ? `${state.position} of ${state.entries.length}: ${describeEntry(current)}`
            : `Start, before ${state.entries.length} changes`,
        }
      },
      on: { keydown: (event, { api }) => api.scrubberKeydown(event) },
    }),
    start: slot({
      attrs: (state) => ({
        type: "button",
        tabindex: "-1",
        "aria-label": "Start",
        "data-applied": state.position === 0 ? "" : undefined,
      }),
      press: ({ api }) => api.seek(0),
    }),
    step: slot<{ value: string }, RewindStepState>({
      props: { value: "string" },
      state: (state, { key }) => {
        const index = state.entries.findIndex((entry) => entry.id === key)
        return {
          entry: state.entries[index],
          applied: index >= 0 && index < state.position,
        }
      },
      attrs: (state, { key }) => {
        const index = state.entries.findIndex((entry) => entry.id === key)
        const entry = state.entries[index]
        if (!entry) {
          return {}
        }
        return {
          type: "button",
          tabindex: "-1",
          title: describeEntry(entry),
          "aria-label": describeEntry(entry),
          "data-source": entry.source,
          "data-applied": index < state.position ? "" : undefined,
          "data-reverted": entry.reverted ? "" : undefined,
        }
      },
      press: ({ api, store, key }) =>
        api.seek(
          store.get().entries.findIndex((entry) => entry.id === key) + 1
        ),
    }),
    undo: slot<{ value: string }, RewindUndoState>({
      props: { value: "string" },
      state: (state, { key }) => ({ disabled: !undoable(state, key) }),
      attrs: (state, { key }) => ({
        type: "button",
        disabled: undoable(state, key) ? undefined : "",
      }),
      press: ({ api, key }) => api.undoSource(key),
    }),
  }),
})

const parts = createParts(rewind, {
  root: "div",
  panel: "div",
  scrubber: "div",
  start: "button",
  step: "button",
})

const Rewind = parts.Root

const RewindPanel = parts.Panel

const RewindScrubber = parts.Scrubber

const RewindStart = parts.Start

const RewindStep = parts.Step

function RewindUndo({
  source,
  ...props
}: { source: string } & PartProps<"button", RewindUndoState>) {
  return usePart(rewind, "undo", { value: source }, props, "button")
}

const agent = createAgent()

const runAgent = () =>
  agent.act({
    steps: [
      { ref: "Volume", action: "setValue", args: [20] },
      { ref: "Do not disturb", action: "setChecked", args: [true] },
      { ref: "Density", action: "setValue", args: ["compact"] },
    ],
  })

function Example() {
  return (
    <Rewind agent={agent}>
      {({ entries, current }) => (
        <>
          <RewindPanel>
            <Settings />
          </RewindPanel>
          <div data-slot="rewind-controls">
            <RewindScrubber aria-label="Rewind">
              <RewindStart />
              {entries.map((entry) => (
                <RewindStep key={entry.id} value={entry.id} />
              ))}
            </RewindScrubber>
            <div data-slot="row">
              <span data-slot="hint">
                {current
                  ? current.reverted
                    ? `Undone: ${describeEntry(current)}`
                    : describeEntry(current)
                  : "Change a setting, or let the agent."}
              </span>
              <div data-slot="row">
                <button type="button" onClick={runAgent} data-size="sm">
                  Run the agent
                </button>
                <RewindUndo data-size="sm" source="agent">
                  Undo the agent
                </RewindUndo>
              </div>
            </div>
          </div>
        </>
      )}
    </Rewind>
  )
}

const densities = ["comfortable", "compact"]

function Settings() {
  return (
    <>
      <div data-slot="row">
        <span>Volume</span>
        <Slider defaultValue={60}>
          <SliderControl>
            <SliderTrack>
              <SliderIndicator />
              <SliderThumb aria-label="Volume" />
            </SliderTrack>
          </SliderControl>
        </Slider>
      </div>
      <label data-slot="label">
        <span>Do not disturb</span>
        <Switch>
          <SwitchThumb />
        </Switch>
      </label>
      <RadioGroup defaultValue="comfortable" aria-label="Density">
        <span>Density</span>
        {densities.map((density) => (
          <label key={density} data-slot="label">
            <Radio value={density}>
              <RadioIndicator />
            </Radio>
            {density}
          </label>
        ))}
      </RadioGroup>
    </>
  )
}

export {
  Example,
  rewind,
  Rewind,
  type RewindOptions,
  RewindPanel,
  type RewindRootState,
  RewindScrubber,
  RewindStart,
  RewindStep,
  type RewindStepState,
  RewindUndo,
  type RewindUndoState,
}
