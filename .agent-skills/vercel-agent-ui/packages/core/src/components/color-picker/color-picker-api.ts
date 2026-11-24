// A color picker's state and what it does. The value is a CSS color string;
// the parts edit a color held in the picker's space, so a hue survives
// dragging to gray and back. Parts and attributes are in color-picker-parts.ts.
import {
  createArea,
  type Area,
} from "../../foundation/direct-manipulation/area"
import { createDragSession } from "../../foundation/drag-and-drop/pointer"
import { createRovingFocus } from "../../foundation/focus/roving-focus"
import { moveIndex, radioStep } from "../../foundation/focus/collection"
import { colorDistance } from "../../foundation/color/compare"
import type { Color } from "../../foundation/color/convert"
import { formatColor, type ColorFormat } from "../../foundation/color/format"
import {
  isInGamut,
  toGamut,
  type ColorGamut,
} from "../../foundation/color/gamut"
import {
  dispatchChange,
  formInternals,
  isDisabled,
} from "../../foundation/forms/form"
import { deriveFromOptions } from "../../foundation/kernel/derive"
import {
  createChange,
  createCommit,
} from "../../foundation/kernel/input-source"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import { snapToStep } from "../../foundation/number/steps"
import { isRTL } from "../../foundation/platform/env"
import type {
  ColorPickerChangeOptions,
  ColorPickerOptions,
  ColorPickerValueChangeReason,
} from "./color-picker"
import {
  black,
  channelOf,
  colorIn,
  defaultAxes,
  inSpace,
  readChannel,
  shown,
  spaceOf,
  withChannel,
  type Channel,
  type ColorChannel,
  type ColorPickerSpace,
} from "./color-picker-channels"
import { keepsValueOnReset } from "../../foundation/forms/value"

type State = {
  value: string
  // What a form reset returns to.
  initial: string
  // The color the parts edit, in `space`. It can sit outside the gamut while
  // a drag is on, and fits it once the drag ends.
  color: Color
  space: ColorPickerSpace
  format: ColorFormat
  gamut: ColorGamut | false
  disabled: boolean
  readOnly: boolean
  required: boolean
  name: string | undefined
  form: string | undefined
  // Disabled by an ancestor fieldset.
  formDisabled: boolean
  // What the text input holds while someone types, until it commits.
  text: string | null
  // Read once the root binds, since gradients have no logical direction.
  rtl: boolean
  // Whether the browser has the EyeDropper API, unknown until a part binds.
  eyeDropper: boolean | null
  // The swatch Tab lands on.
  stop: string | null
}

type Orientation = "horizontal" | "vertical"

type Details = { reason: ColorPickerValueChangeReason; event?: Event }

const formatFor = (space: ColorPickerSpace, format: ColorFormat | undefined) =>
  format ?? (space === "hsv" ? "hex" : space)

function settings(options: ColorPickerOptions) {
  const space = spaceOf(options.space)
  return {
    space,
    format: formatFor(space, options.format),
    gamut: options.gamut ?? "srgb",
    disabled: !!options.disabled,
    readOnly: !!options.readOnly,
    required: !!options.required,
    name: options.name,
    form: options.form,
  } satisfies Partial<State>
}

const output = (color: Color, state: Pick<State, "format" | "gamut">) =>
  formatColor(shown(color, state.gamut), state.format)

function initialState(options: ColorPickerOptions): State {
  const base = settings(options)
  const given = options.value ?? options.defaultValue
  const color =
    (given !== undefined && colorIn(given, base.space)) || black(base.space)
  const value = given ?? output(color, base)
  return {
    ...base,
    value,
    initial: options.defaultValue ?? value,
    color,
    formDisabled: false,
    text: null,
    rtl: false,
    eyeDropper: null,
    stop: null,
  }
}

function syncState(options: ColorPickerOptions) {
  return {
    ...settings(options),
    ...(options.defaultValue === undefined
      ? {}
      : { initial: options.defaultValue }),
    ...(options.value === undefined ? {} : { value: options.value }),
  }
}

const isLocked = (state: State) => isDisabled(state) || state.readOnly

// Two colors are the same swatch when they look alike, whatever they're written in.
const isSameColor = (first: Color, second: Color) =>
  colorDistance(first, second) < 0.002 &&
  Math.abs(first.alpha - second.alpha) < 0.005

type EyeDropperWindow = Window & {
  EyeDropper?: new () => {
    open: (options?: { signal?: AbortSignal }) => Promise<{ sRGBHex: string }>
  }
}

function colorPickerApiBody(
  context: PrimitiveContext<ColorPickerOptions, State, string>
) {
  const { store, element } = context
  const change = createChange(context)
  const commitValue = createCommit(context)
  const drags = createDragSession(context.onDestroy)
  const areas = new Map<string, Area>()
  // The value an interaction started from, so it commits only what it changed.
  let start: string | undefined
  // The last value a change asked for. A controlled value only arrives with
  // the owner's next render, after a key or a swatch has already committed.
  let changed: string | undefined

  const begin = () => {
    start = store.get().value
    changed = undefined
  }

  const channel = (name: ColorChannel | undefined) =>
    channelOf(store.get().space, name)

  const formElement = () => {
    const root = element("root")
    return formInternals(root) ? root : element("hidden-input")
  }

  const publicColor = (color: Color) => shown(color, store.get().gamut)

  // The color the parts show moves first, then the value, which a format
  // like hex may round to the same string for a small move.
  function setColor(color: Color, details: Details, notify = true) {
    const state = store.get()
    const value = output(color, state)
    const before = state.color
    store.set({ color })
    if (value === state.value) {
      return true
    }
    const done = change("value", value, {
      ...details,
      color: publicColor(color),
    })
    if (!done) {
      store.set({ color: before })
    } else {
      changed = value
      if (notify) {
        dispatchChange(formElement(), ["input"])
      }
    }
    return done
  }

  // Once an interaction ends: a color outside the gamut fits it, and the
  // value commits if it changed.
  function commit(details: Details) {
    const from = start
    start = undefined
    const state = store.get()
    if (state.gamut && !isInGamut(state.color, state.gamut)) {
      store.set({ color: toGamut(state.color, state.gamut) })
    }
    const value = changed ?? store.get().value
    changed = undefined
    if (from === undefined || from === value) {
      return
    }
    commitValue("value", value, {
      ...details,
      color: publicColor(store.get().color),
    })
    dispatchChange(formElement(), ["change"])
  }

  // A change made in one go, like a swatch press, which commits at once.
  function choose(color: Color, details: Details) {
    if (isLocked(store.get())) {
      return false
    }
    begin()
    const done = setColor(color, details)
    commit(details)
    return done
  }

  function area(x: ColorChannel | undefined, y: ColorChannel | undefined) {
    const key = `${x}/${y}`
    let made = areas.get(key)
    if (made) {
      return made
    }
    const axes = () => {
      const { space } = store.get()
      return {
        x: channelOf(space, x ?? defaultAxes[space].x),
        y: channelOf(space, y ?? defaultAxes[space].y),
      }
    }
    const axis = (spec: Channel) => ({
      min: 0,
      max: spec.max,
      step: spec.step,
      label: spec.label,
    })
    made = createArea(context, {
      value: (state) => {
        const { x, y } = axes()
        return {
          x: readChannel(state.color, x),
          y: readChannel(state.color, y),
        }
      },
      set: (value, details) => {
        const { x, y } = axes()
        return setColor(
          withChannel(withChannel(store.get().color, x, value.x), y, value.y),
          details
        )
      },
      x: () => axis(axes().x),
      y: () => axis(axes().y),
      valueText: (value) => {
        const { x, y } = axes()
        return `${x.label} ${valueText(value.x, x)}, ${y.label} ${valueText(value.y, y)}`
      },
      onCommit: (_value, details) => commit(details),
      disabled: () => isLocked(store.get()),
    })
    areas.set(key, made)
    return made
  }

  function isSelected(value: string | undefined) {
    const color = value === undefined ? null : colorIn(value, store.get().space)
    return (
      !!color && isSameColor(publicColor(color), publicColor(store.get().color))
    )
  }

  const roving = createRovingFocus<State, { value: string }>(context, {
    slot: "swatch-item",
    key: "stop",
    remember: false,
    disabled: () => isLocked(store.get()),
    preferred: (item) => isSelected(item.props?.value),
    move(event, { from, items, rtl }) {
      if (event.shiftKey) {
        return
      }
      const step = radioStep(event.key, rtl)
      if (step !== undefined) {
        return items[moveIndex(items.indexOf(from), step, items.length, false)]
          .key
      }
      if (event.key === "Home") {
        return items[0]?.key
      }
      if (event.key === "End") {
        return items[items.length - 1]?.key
      }
    },
  })

  const sliderValue = (channelName: ColorChannel | undefined) =>
    readChannel(store.get().color, channel(channelName))

  function setChannel(
    channelName: ColorChannel | undefined,
    value: number,
    details: Details
  ) {
    const spec = channel(channelName)
    const snapped = snapToStep(value, {
      min: 0,
      max: spec.max,
      step: spec.step,
    })
    if (snapped === sliderValue(channelName)) {
      return false
    }
    return setColor(withChannel(store.get().color, spec, snapped), details)
  }

  const api = {
    getValue: () => store.get().value,
    setValue(
      value: string,
      { reason = "imperative", event }: ColorPickerChangeOptions = {}
    ) {
      const color = colorIn(value, store.get().space)
      if (!color) {
        return false
      }
      return setColor(color, { reason, event }, false)
    },
    focus() {
      const target =
        element("area-thumb") ?? element("slider-thumb") ?? element("input")
      target?.focus()
    },
    internal: {
      area,
      channel,
      sliderValue,
      roving,
      output: (color: Color) => output(color, store.get()),
      isSelected,
      setRTL: (el: HTMLElement) => store.set({ rtl: isRTL(el) }),
      areaPointerdown(
        event: PointerEvent,
        el: HTMLElement,
        x?: ColorChannel,
        y?: ColorChannel
      ) {
        begin()
        area(x, y).pointerdown(event, el)
      },
      areaKeydown(event: KeyboardEvent, x?: ColorChannel, y?: ColorChannel) {
        begin()
        area(x, y).keydown(event)
      },
      // A press on a slider's track moves its thumb there and follows the pointer.
      sliderPointerdown(
        event: PointerEvent,
        el: HTMLElement,
        name?: ColorChannel,
        orientation?: Orientation
      ) {
        if (!drags.accepts(event) || isLocked(store.get())) {
          return
        }
        event.preventDefault()
        const vertical = orientation === "vertical"
        const rtl = isRTL(el)
        const rect = el.getBoundingClientRect()
        const at = (x: number, y: number) => {
          const length = vertical ? rect.height : rect.width
          let fraction = length
            ? (vertical ? rect.bottom - y : x - rect.left) / length
            : 0
          if (!vertical && rtl) {
            fraction = 1 - fraction
          }
          return Math.min(1, Math.max(0, fraction)) * channel(name).max
        }
        begin()
        let reason: "track-press" | "drag" = "track-press"
        setChannel(name, at(event.clientX, event.clientY), { reason, event })
        el.querySelector<HTMLElement>('[role="slider"]')?.focus({
          preventScroll: true,
        })
        const unsubscribe = store.subscribe(
          () => isLocked(store.get()) && drags.cancel()
        )
        drags.start(el, event, {
          onMove: (sample) => {
            if (
              setChannel(name, at(sample.x, sample.y), {
                reason: "drag",
                event: sample.event,
              })
            ) {
              reason = "drag"
            }
          },
          onEnd: (end) => {
            unsubscribe()
            commit({ reason, event: end })
          },
        })
      },
      // Arrows step, Shift ten steps, Page Up and Page Down a tenth of the
      // range, Home and End jump to the ends, as on a slider.
      sliderKeydown(event: KeyboardEvent, name?: ColorChannel) {
        if (
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          isLocked(store.get())
        ) {
          return
        }
        const spec = channel(name)
        const current = sliderValue(name)
        const rtl = event.target instanceof Element && isRTL(event.target)
        const steps = spec.step * (event.shiftKey ? 10 : 1)
        const keys: Record<string, number> = {
          ArrowUp: current + steps,
          ArrowDown: current - steps,
          ArrowRight: current + (rtl ? -steps : steps),
          ArrowLeft: current - (rtl ? -steps : steps),
          PageUp: current + spec.max / 10,
          PageDown: current - spec.max / 10,
          Home: 0,
          End: spec.max,
        }
        if (!(event.key in keys)) {
          return
        }
        event.preventDefault()
        begin()
        setChannel(name, keys[event.key], { reason: "step-key", event })
        commit({ reason: "step-key", event })
      },
      setChannelValue(
        name: ColorChannel | undefined,
        value: number,
        event: Event
      ) {
        if (isLocked(store.get()) || !Number.isFinite(value)) {
          return
        }
        begin()
        setChannel(name, value, { reason: "input-commit", event })
        commit({ reason: "input-commit", event })
      },
      setText(text: string) {
        store.set({ text })
      },
      // Reads the text typed into the input. Text that isn't a color goes back to the value.
      commitText(event?: Event) {
        const { text, space } = store.get()
        if (text === null) {
          return
        }
        const color = colorIn(text, space)
        if (color && !isLocked(store.get())) {
          choose(color, { reason: "input-commit", event })
        }
        store.set({ text: null })
      },
      revertText() {
        store.set({ text: null })
      },
      choose: (value: string, details: Details) => {
        const color = colorIn(value, store.get().space)
        return !!color && choose(color, details)
      },
      setEyeDropper: (el: HTMLElement) =>
        store.set({
          eyeDropper: !!(
            el.ownerDocument.defaultView as EyeDropperWindow | null
          )?.EyeDropper,
        }),
      // The browser's EyeDropper, where it has one. Escape cancels it, which changes nothing.
      pickFromScreen(el: HTMLElement | undefined, event?: Event) {
        const EyeDropper = (
          el?.ownerDocument.defaultView as EyeDropperWindow | null
        )?.EyeDropper
        if (!EyeDropper || isLocked(store.get())) {
          return
        }
        new EyeDropper()
          .open()
          .then(({ sRGBHex }) =>
            api.internal.choose(sRGBHex, { reason: "eye-dropper-pick", event })
          )
          .catch(() => {})
      },
      reset() {
        const { value, defaultValue } = context.options()
        if (keepsValueOnReset(value, defaultValue)) {
          return
        }
        const color = colorIn(store.get().initial, store.get().space)
        if (color) {
          setColor(color, { reason: "reset" }, false)
        }
      },
      restore(saved: string) {
        api.setValue(saved, { reason: "restore" })
      },
      setFormDisabled(formDisabled: boolean) {
        store.set({ formDisabled })
      },
      submitted: () =>
        store.get().name === undefined ? null : store.get().value,
    },
  }

  // A value that arrives as the color the parts hold would write keeps that
  // color, with its hue. Any other reads anew, in the space that arrives.
  deriveFromOptions(context, ["color"], (synced, state) => {
    const next = { ...state, ...synced }
    const kept =
      next.space === state.space
        ? state.color
        : inSpace(state.color, next.space)
    if (next.value === state.value) {
      return kept === state.color ? undefined : { color: kept }
    }
    if (next.value === output(kept, next)) {
      return { color: kept }
    }
    return { color: colorIn(next.value, next.space) ?? kept }
  })

  return api
}

const colorPickerApi: (
  ...args: Parameters<typeof colorPickerApiBody>
) => ColorPickerApi = colorPickerApiBody

const valueText = (value: number, spec: Channel) => {
  const decimals = spec.step < 1 ? String(spec.step).length - 2 : 0
  const rounded = Number(value.toFixed(decimals))
  return spec.unit === "°" ? `${rounded} degrees` : `${rounded}${spec.unit}`
}

/**
 * `colorPicker`'s api, which its slots and controller call. Adapters expose it as `api`.
 * @experimental
 */
interface ColorPickerApi extends ReturnType<typeof colorPickerApiBody> {}

export {
  colorPickerApi,
  type ColorPickerApi,
  initialState,
  isLocked,
  type Orientation,
  output,
  type State,
  syncState,
  valueText,
}
