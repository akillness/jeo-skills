// A slider's state and what it does: values, keys, drags and commits. The
// parts and their attributes are in slider.ts, the pure decisions in slider-values.ts.
import { orientationOf } from "../../foundation/focus/collection"
import { createDragSession } from "../../foundation/drag-and-drop/pointer"
import { isRTL } from "../../foundation/platform/env"
import {
  dispatchChange,
  formInternals,
  isDisabled,
} from "../../foundation/forms/form"
import {
  displayOptions,
  formatNumber,
  type NumberFormat,
} from "../../foundation/number/format"
import { parseRange } from "../../foundation/number/parse"
import { clamp } from "../../foundation/number/steps"
import { localeOf } from "../../foundation/text/locale"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import { heldState, sameValue } from "../../foundation/kernel/store"
import { deriveFromOptions, deriveState } from "../../foundation/kernel/derive"
import type {
  SliderChangeOptions,
  SliderOptions,
  SliderValueChangeReason,
} from "./slider"
import {
  fractionAlong,
  keyTarget,
  moveThumb,
  normalizeValues,
  stackAt,
  thumbBounds,
  thumbForDirection,
  thumbForPress,
  valueAt,
} from "./slider-values"
import {
  createChange,
  createCommit,
} from "../../foundation/kernel/input-source"
import { keepsValueOnReset } from "../../foundation/forms/value"

type State = {
  value: number | number[]
  // What a form reset returns to: `defaultValue`, or the first value.
  initial: number | number[]
  min: number
  max: number
  step: number
  largeStep: number
  minStepsBetweenThumbs: number
  orientation: "horizontal" | "vertical"
  disabled: boolean
  readOnly: boolean
  required: boolean
  // Disabled by an ancestor fieldset.
  formDisabled: boolean
  name: string | undefined
  form: string | undefined
  format: NumberFormat | undefined
  locale: string | undefined
  // The page's language, read once the root binds.
  pageLocale: string | null
  // The thumb being dragged.
  active: number | null
  // The thumb that moved last, drawn above the others in a range.
  last: number | null
  // Each thumb's value by its index. Thumbs select on their own entry and
  // their neighbours', so a move reaches only the thumbs it changes.
  thumbValues: Record<string, number>
  thumbInputId: string | null
}

const isLocked = (state: State) => isDisabled(state) || state.readOnly
const valuesOf = (value: number | number[]) =>
  Array.isArray(value) ? value : [value]
function thumbValuesOf(value: number | number[]) {
  const record: Record<string, number> = {}
  valuesOf(value).forEach((item, index) => (record[index] = item))
  return record
}
function holdsValue(
  thumbValues: Record<string, number>,
  value: number | number[]
) {
  if (!Array.isArray(value)) {
    return Object.is(thumbValues[0], value) && thumbValues[1] === undefined
  }
  return (
    thumbValues[value.length] === undefined &&
    value.every((item, index) => Object.is(thumbValues[index], item))
  )
}
// Keeps a single value a number, so `onValueChange` gets back what it was given.
const shaped = (values: number[], like: number | number[]) =>
  Array.isArray(like) ? values : values[0]

function rangeOf(state: State) {
  return {
    min: state.min,
    max: state.max,
    step: state.step,
    largeStep: state.largeStep,
    minStepsBetweenThumbs: state.minStepsBetweenThumbs,
  }
}

function bounds(options: SliderOptions) {
  const min = options.min ?? 0
  const max = options.max ?? 100
  const step = options.step && options.step > 0 ? options.step : 1
  return { min, max, step }
}

// Values from outside are clamped and sorted for drawing. A controlled value isn't rewritten.
function normalized(value: number | number[], options: SliderOptions) {
  const range = bounds(options)
  return Array.isArray(value)
    ? normalizeValues(value, range)
    : clamp(value, range.min, range.max)
}

function settings(options: SliderOptions) {
  const range = bounds(options)
  return {
    ...range,
    largeStep: options.largeStep ?? range.step * 10,
    minStepsBetweenThumbs: options.minStepsBetweenThumbs ?? 0,
    orientation: orientationOf(options.orientation, "horizontal"),
    disabled: !!options.disabled,
    readOnly: !!options.readOnly,
    required: !!options.required,
    name: options.name,
    form: options.form,
    format: options.format,
    locale: options.locale,
  }
}

// Intl options show at least as many decimals as the step, so a step of 0.001
// never reads as 0. A function formats the value as it likes.
function formatValue(value: number, state: State) {
  const format =
    typeof state.format === "function"
      ? state.format
      : displayOptions(state.format, state.step)
  return formatNumber(value, localeOf(state), format)
}

/** One form value for several numbers, `"start/end"` like an ISO interval (G12). */
function formatRange(values: readonly (number | string)[]) {
  return values.join("/")
}

// What the form submits: the number, or `"start/end"` for a range (G12).
function submitted(state: State) {
  return Array.isArray(state.value)
    ? formatRange(state.value)
    : String(state.value)
}

type Gesture = {
  // Null while a press on stacked thumbs waits for the first move to pick one.
  index: number | null
  stack: number[]
  // How far from its thumb's value the press was, kept as it moves, so the
  // thumb stays under the pointer instead of jumping to it.
  offset: number
  start: number | number[]
  reason: SliderValueChangeReason
  event: Event | undefined
}

function sliderApiBody(
  context: PrimitiveContext<SliderOptions, State, string>
) {
  const { store, options, element } = context
  const change = createChange(context)
  const commitValue = createCommit(context)
  const drags = createDragSession(context.onDestroy)
  let gesture: Gesture | undefined
  // Keys commit when they come up, so holding one commits once.
  let keys:
    | { start: number | number[]; thumb: number; event?: KeyboardEvent }
    | undefined

  const range = () => rangeOf(store.get())
  const values = () => valuesOf(store.get().value)

  const formElement = () => {
    const root = element("root")
    return formInternals(root) ? root : element("input")
  }

  // `notify` is off when the range input's own `input` and `change` events
  // already bubble to the form, like after a screen reader's adjustment.
  function setValues(
    next: readonly number[],
    reason: SliderValueChangeReason,
    event: Event | undefined,
    thumb: number | null,
    notify = true
  ) {
    if (next === values()) {
      return false
    }
    // `moveThumb` returns a new array whenever a thumb moved, so it's ours to hand over.
    const done = change("value", shaped(next as number[], store.get().value), {
      reason,
      event,
      thumb,
    })
    if (done) {
      if (thumb !== null) {
        store.set({ last: thumb })
      }
      // `change` waits for the commit, like a native range's.
      if (notify) {
        dispatchChange(formElement(), ["input"])
      }
    }
    return done
  }

  function commit(
    start: number | number[],
    reason: SliderValueChangeReason,
    event?: Event,
    thumb: number | null = null,
    notify = true
  ) {
    const value = store.get().value
    if (sameValue(start, value)) {
      return
    }
    commitValue("value", value, { reason, event, thumb })
    if (notify) {
      dispatchChange(formElement(), ["change"])
    }
  }

  const thumbInput = (index: number) =>
    element("thumb-input", String(index)) as HTMLInputElement | undefined

  function setValue(
    value: number | number[],
    reason: SliderValueChangeReason,
    event?: Event
  ) {
    // Sorted first, then each thumb snapped and kept from its neighbours.
    const sorted = valuesOf(normalized(value, options()))
    const next = sorted.reduce<readonly number[]>(
      (result, item, index) => moveThumb(result, index, item, range()),
      sorted
    )
    if (sameValue(next, values())) {
      return false
    }
    return change("value", shaped(next.slice(), store.get().value), {
      reason,
      event,
      thumb: null,
    })
  }

  const api = {
    getValue: () => store.get().value,
    setValue: (
      value: number | number[],
      { reason = "imperative", event }: SliderChangeOptions = {}
    ) => !isLocked(store.get()) && setValue(value, reason, event),
    focus: (thumb = 0) => thumbInput(thumb)?.focus(),
    internal: {
      // A press on the web: the track's box is read once, so moves never read layout.
      press(event: PointerEvent, control: HTMLElement) {
        if (!drags.accepts(event) || isLocked(store.get()) || gesture) {
          return
        }
        const rect = (element("track") ?? control).getBoundingClientRect()
        const rtl = isRTL(control)
        const vertical = store.get().orientation === "vertical"
        const at = (x: number, y: number) =>
          valueAt(fractionAlong({ x, y }, rect, { rtl, vertical }), range())
        const pressedThumb = (event.target as Element).closest<HTMLElement>(
          '[data-slot="slider-thumb"]'
        )
        const thumb =
          pressedThumb && control.contains(pressedThumb)
            ? Number(pressedThumb.getAttribute("data-index") ?? 0)
            : null
        // No text selection, and no native focus that would land elsewhere.
        event.preventDefault()
        const focused = api.internal.begin(
          at(event.clientX, event.clientY),
          thumb,
          event
        )
        thumbInput(focused)?.focus({ preventScroll: true })
        drags.start(control, event, {
          onMove: (sample) =>
            api.internal.move(at(sample.x, sample.y), sample.event),
          onEnd: (end) => api.internal.end(end),
        })
      },
      // Starts a drag at a value: on a thumb, which keeps its offset from the
      // press and doesn't move, or on the track, which moves the nearest thumb
      // there. Returns the thumb that takes focus.
      begin(pressed: number, thumb: number | null, event?: Event) {
        const start = store.get().value
        let index: number | null
        let stack: number[]
        let offset = 0
        if (thumb !== null) {
          stack = stackAt(values(), thumb)
          index = stack.length > 1 ? null : thumb
          offset = pressed - values()[thumb]
        } else {
          ;({ index, stack } = thumbForPress(values(), pressed))
          if (index !== null) {
            setValues(
              moveThumb(values(), index, pressed, range()),
              "track-press",
              event,
              index
            )
          }
        }
        const focused = index ?? stack[0]
        gesture = { index, stack, offset, start, reason: "track-press", event }
        store.set({ active: focused })
        return focused
      },
      move(pressed: number, event?: Event) {
        if (!gesture) {
          return
        }
        const target = pressed - gesture.offset
        if (gesture.index === null) {
          // Stacked thumbs: the direction of the first move picks one.
          const direction = Math.sign(target - values()[gesture.stack[0]])
          if (direction === 0) {
            return
          }
          gesture.index = thumbForDirection(gesture.stack, direction)
          thumbInput(gesture.index)?.focus({ preventScroll: true })
          store.set({ active: gesture.index })
        }
        if (
          setValues(
            moveThumb(values(), gesture.index, target, range()),
            "drag",
            event,
            gesture.index
          )
        ) {
          gesture.reason = "drag"
          gesture.event = event
        }
      },
      end(event?: Event) {
        const ended = gesture
        gesture = undefined
        store.set({ active: null })
        if (ended) {
          commit(ended.start, ended.reason, event, ended.index)
        }
      },
      // A screen reader's adjustment through the thumb's native range input,
      // like a swipe on iOS. It commits at once.
      adjust(index: number, target: number, event: Event) {
        if (store.get().readOnly) {
          return
        }
        const start = store.get().value
        // The thumb's range input fired `input`, and fires `change`, which
        // bubble to the form already, so the slider adds none of its own.
        setValues(
          moveThumb(values(), index, target, range()),
          "accessibility-adjust",
          event,
          index,
          false
        )
        commit(start, "accessibility-adjust", event, index, false)
      },
      keydown(event: KeyboardEvent, index: number, input: HTMLElement) {
        const state = store.get()
        if (isDisabled(state)) {
          return
        }
        const current = values()[index] ?? state.min
        const target = keyTarget(
          event.key,
          {
            shiftKey: event.shiftKey,
            rtl: isRTL(input),
            orientation: state.orientation,
          },
          current,
          thumbBounds(values(), index, range()),
          range()
        )
        if (target === null) {
          return
        }
        event.preventDefault()
        if (state.readOnly) {
          return
        }
        keys ??= { start: state.value, thumb: index }
        keys.event = event
        setValues(
          moveThumb(values(), index, target, range()),
          "step-key",
          event,
          index
        )
      },
      // The key came up, or focus left while it was down, so its keyup goes
      // elsewhere and the last keydown stands for it.
      commitKeys(event?: KeyboardEvent) {
        if (!keys) {
          return
        }
        const { start, thumb, event: last } = keys
        keys = undefined
        commit(start, "step-key", event ?? last, thumb)
      },
      reset() {
        if (keepsValueOnReset(options().value, options().defaultValue)) {
          return
        }
        change("value", store.get().initial, { reason: "reset", thumb: null })
      },
      // The browser restores a disabled or read-only control too, as a native one.
      restore(saved: string) {
        const parsed = parseRange(saved)
        if (parsed) {
          setValue(shaped(parsed, store.get().value), "restore")
        }
      },
      setFormDisabled(formDisabled: boolean) {
        store.set({ formDisabled })
      },
      submitted: () =>
        store.get().name === undefined ? null : submitted(store.get()),
      // Writes what the framework's attributes would, before they render, so
      // a native range never clamps a value to stale bounds. Only what
      // changed, since every write is a mutation the page restyles for.
      syncInput(input: HTMLInputElement, index: number) {
        const { lower, upper } = thumbBounds(values(), index, range())
        const min = String(lower)
        const max = String(upper)
        const value = String(values()[index] ?? store.get().min)
        if (input.min !== min) {
          input.min = min
        }
        if (input.max !== max) {
          input.max = max
        }
        if (input.value !== value) {
          input.value = value
        }
      },
    },
  }

  // New bounds clamp an uncontrolled value, without a change event, like a native range.
  deriveFromOptions(context, ["value"], (synced, state, arriving) => {
    const { min, max } = bounds(arriving)
    if (arriving.value !== undefined || !(min <= max)) {
      return
    }
    const value = normalized(state.value, arriving)
    if (!sameValue(value, state.value)) {
      return { value }
    }
  })

  // The same value makes the same record, so a render and its handover agree. A dropped
  // preview never replaces the held record, checked held since a value the framework
  // rendered isn't written yet, and a thumb's input hears only writes.
  let made = { value: store.get().value, thumbValues: store.get().thumbValues }
  deriveState(context, ["thumbValues"], ({ value }) => {
    if (holdsValue(heldState(store).thumbValues, value)) {
      return
    }
    if (!sameValue(value, made.value)) {
      made = { value, thumbValues: thumbValuesOf(value) }
    }
    return { thumbValues: made.thumbValues }
  })
  // Disabling it or making it read-only mid-drag ends the drag.
  store.subscribe(() => {
    if (!gesture || !isLocked(store.get())) {
      return
    }
    drags.cancel()
    api.internal.end()
  })

  return api
}

const sliderApi: (...args: Parameters<typeof sliderApiBody>) => SliderApi =
  sliderApiBody

/**
 * `slider`'s api, which its slots and controller call. Adapters
 * expose it as `api`.
 * @stable
 */
interface SliderApi extends ReturnType<typeof sliderApiBody> {}

export {
  formatRange,
  formatValue,
  isDisabled,
  normalized,
  rangeOf,
  settings,
  shaped,
  type SliderApi,
  sliderApi,
  type State,
  submitted,
  thumbValuesOf,
  valuesOf,
}
