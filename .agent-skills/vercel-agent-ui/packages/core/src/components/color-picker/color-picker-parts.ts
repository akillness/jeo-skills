// A color picker's parts and their attributes. State and what the parts do
// live in color-picker-api.ts.
import { convertColor, type Color } from "../../foundation/color/convert"
import { isInGamut } from "../../foundation/color/gamut"
import { parseColor } from "../../foundation/color/parse"
import {
  bindInternals,
  bindValueInput,
  isDisabled,
  takeTypedText,
} from "../../foundation/forms/form"
import { css } from "../../foundation/kernel/inline-style"
import type { SlotFactory } from "../../foundation/kernel/primitive-types"
import type { ColorPickerApi, State } from "./color-picker-api"
import { isLocked, valueText } from "./color-picker-api"
import {
  areaGradient,
  channelGradient,
  cssOf,
  defaultAxes,
  describeColor,
  readChannel,
  shown,
  withChannel,
  type Channel,
  type ColorChannel,
} from "./color-picker-channels"
import type {
  ColorPickerAreaProps,
  ColorPickerChannelInputProps,
  ColorPickerSliderProps,
  ColorPickerSliderState,
  ColorPickerState,
  ColorPickerSwatchItemProps,
  ColorPickerSwatchItemState,
} from "./color-picker"

const isOutOfGamut = (state: State) =>
  !!state.gamut && !isInGamut(state.color, state.gamut)

function pickerState(state: State) {
  return {
    value: state.value,
    color: state.color,
    space: state.space,
    disabled: isDisabled(state),
    readOnly: state.readOnly,
    required: state.required,
    outOfGamut: isOutOfGamut(state),
  } satisfies ColorPickerState
}

function dataAttrs(state: State) {
  return {
    "data-disabled": isDisabled(state) ? "" : undefined,
    "data-readonly": state.readOnly ? "" : undefined,
    "data-required": state.required ? "" : undefined,
    "data-out-of-gamut": isOutOfGamut(state) ? "" : undefined,
  }
}

const colorVariable = (state: State) => cssOf(shown(state.color, state.gamut))

const sliderKeys = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "shift+ArrowUp",
  "shift+ArrowDown",
  "shift+ArrowLeft",
  "shift+ArrowRight",
  "PageUp",
  "PageDown",
  "Home",
  "End",
] as const

// A number input's value on its step, which the input would otherwise call invalid.
const onStep = (value: number, step: number) =>
  Number(value.toFixed(Math.max(0, -Math.floor(Math.log10(step)))))

const percentOf = (value: number, spec: Channel) =>
  Math.round((value / spec.max) * 1e4) / 100

// The slot declares the role the area's attributes carry.
function withoutRole<Attrs extends { role?: string }>({
  role,
  ...attrs
}: Attrs) {
  return attrs
}

const channelNames = (state: State, props: ColorPickerAreaProps) => ({
  x: props.x ?? defaultAxes[state.space].x,
  y: props.y ?? defaultAxes[state.space].y,
})

// Every pixel of the area for the color's other channels, in the gamut's
// space. Colors outside it stay transparent, so the edge shows its shape.
function paintArea(
  canvas: HTMLCanvasElement,
  state: State,
  x: Channel,
  y: Channel
) {
  const width = Math.max(2, Math.min(160, Math.round(canvas.clientWidth)))
  const height = Math.max(
    2,
    Math.round((width * canvas.clientHeight) / Math.max(1, canvas.clientWidth))
  )
  const p3 = state.gamut === "p3"
  const context = canvas.getContext("2d", {
    colorSpace: p3 ? "display-p3" : "srgb",
  })
  if (!context) {
    return
  }
  if (canvas.width !== width) {
    canvas.width = width
  }
  if (canvas.height !== height) {
    canvas.height = height
  }
  const image = context.createImageData(width, height, {
    colorSpace: p3 ? "display-p3" : "srgb",
  })
  const base = { ...state.color, alpha: 1 }
  const target = p3 ? "display-p3" : "srgb"
  const rowColor = (row: number) =>
    withChannel(base, y, (1 - row / (height - 1)) * y.max)
  const colorAt = (atRow: Color, column: number) => {
    const along = column / (width - 1)
    return convertColor(
      withChannel(atRow, x, (state.rtl ? 1 - along : along) * x.max),
      target
    ).coords
  }
  // Tighter than isInGamut, whose tolerance near black would paint a sliver
  // of colors past the edge.
  const fits = (coords: Color["coords"]) => {
    for (let index = 0; index < 3; index++) {
      const value = coords[index] ?? 0
      if (value < -0.000001 || value > 1.000001) {
        return false
      }
    }
    return true
  }
  const inside = new Uint8Array(width * height)
  for (let row = 0; row < height; row++) {
    const atRow = rowColor(row)
    for (let column = 0; column < width; column++) {
      const coords = colorAt(atRow, column)
      const pixel = row * width + column
      inside[pixel] = fits(coords) ? 1 : 0
      for (let index = 0; index < 3; index++) {
        image.data[pixel * 4 + index] = Math.round(
          Math.min(1, Math.max(0, coords[index] ?? 0)) * 255
        )
      }
    }
  }
  // The canvas is smaller than the area, so a hard edge would show as steps.
  // A pixel on the edge is as opaque as the share of it inside.
  const offsets = [-1 / 3, 0, 1 / 3]
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const pixel = row * width + column
      const own = inside[pixel]
      const edge =
        (column > 0 && inside[pixel - 1] !== own) ||
        (column < width - 1 && inside[pixel + 1] !== own) ||
        (row > 0 && inside[pixel - width] !== own) ||
        (row < height - 1 && inside[pixel + width] !== own)
      let share = own
      if (edge) {
        let count = 0
        for (const down of offsets) {
          const atRow = rowColor(row + down)
          for (const across of offsets) {
            count += fits(colorAt(atRow, column + across)) ? 1 : 0
          }
        }
        share = count / (offsets.length * offsets.length)
      }
      image.data[pixel * 4 + 3] = Math.round(share * 255)
    }
  }
  context.putImageData(image, 0, 0)
}

function colorPickerSlots(slot: SlotFactory<State, ColorPickerApi>) {
  return {
    root: slot<{}, ColorPickerState>({
      role: "group",
      state: pickerState,
      attrs: (state) => ({
        ...dataAttrs(state),
        style: css({ "--color-picker-color": colorVariable(state) }),
      }),
      bind: (el, { api, store }) => {
        api.internal.setRTL(el)
        return bindInternals(el, {
          value: api.internal.submitted,
          state: () => store.get().value,
          restore: api.internal.restore,
          valueMissing: () => false,
          message: () => "",
          anchor: () => el,
          focus: () => api.focus(),
          reset: api.internal.reset,
          disabled: api.internal.setFormDisabled,
          subscribe: store.subscribe,
        })
      },
    }),

    // A surface for two channels. `--color-area-background` draws it where
    // gradients can: saturation by brightness or lightness. Others take a canvas.
    area: slot<ColorPickerAreaProps, ColorPickerState>({
      props: { x: "string", y: "string" },
      state: pickerState,
      attrs: (state, { props }) => {
        const { x, y } = channelNames(state, props)
        return {
          ...dataAttrs(state),
          style: css({
            position: "relative",
            "touch-action": "none",
            "--color-area-background": areaGradient(
              state.color,
              x,
              y,
              state.rtl
            ),
          }),
        }
      },
      on: {
        pointerdown: (event, { api, el, props }) =>
          el && api.internal.areaPointerdown(event, el, props.x, props.y),
      },
    }),

    "area-thumb": slot<ColorPickerAreaProps, ColorPickerState>({
      role: "slider",
      focus: "tab-stop",
      keys: sliderKeys,
      props: {
        x: { kind: "string", from: "area" },
        y: { kind: "string", from: "area" },
      },
      state: pickerState,
      attrs: (state, { api, props }) => {
        const area = api.internal.area(props.x, props.y)
        const thumb = withoutRole(area.thumbAttrs(state))
        const { x, y } = channelNames(state, props)
        return {
          ...thumb,
          tabindex: isDisabled(state) ? "-1" : "0",
          "aria-disabled": isDisabled(state) ? "true" : undefined,
          "aria-readonly": state.readOnly ? "true" : undefined,
          // English by default. Pass `aria-label` in another language.
          "aria-label": `${api.internal.channel(x).label} and ${api.internal.channel(y).label.toLowerCase()}`,
          ...dataAttrs(state),
          style: area.thumbStyle(state),
        }
      },
      on: {
        keydown: (event, { api, props }) =>
          api.internal.areaKeydown(event, props.x, props.y),
      },
    }),

    // Paints the area pixel by pixel, for channels no gradient draws, like
    // OKLCH's chroma by lightness, whose gamut edge is a curve.
    "area-canvas": slot<ColorPickerAreaProps>({
      props: {
        x: { kind: "string", from: "area" },
        y: { kind: "string", from: "area" },
      },
      attrs: () => ({
        "aria-hidden": "true",
        style:
          "position:absolute;inset:0;width:100%;height:100%;pointer-events:none",
      }),
      bind(el, { api, store, props }) {
        const canvas = el as HTMLCanvasElement
        let painted = ""
        let frame = 0
        const view = canvas.ownerDocument.defaultView ?? window
        const paint = () => {
          frame = 0
          const state = store.get()
          const { x: xName, y: yName } = channelNames(state, props)
          const x = api.internal.channel(xName)
          const y = api.internal.channel(yName)
          // Only the channels the area doesn't show change its picture.
          const held = withChannel(
            withChannel({ ...state.color, alpha: 1 }, x, 0),
            y,
            0
          )
          const key = `${held.space} ${held.coords.join(" ")} ${state.gamut} ${state.rtl} ${canvas.clientWidth}x${canvas.clientHeight}`
          if (key === painted) {
            return
          }
          painted = key
          paintArea(canvas, state, x, y)
        }
        const schedule = () => {
          if (!frame) {
            frame = view.requestAnimationFrame(paint)
          }
        }
        paint()
        const unsubscribe = store.subscribe(schedule)
        const observer =
          typeof ResizeObserver === "undefined"
            ? undefined
            : new ResizeObserver(schedule)
        observer?.observe(canvas)
        return () => {
          unsubscribe()
          observer?.disconnect()
          if (frame) {
            view.cancelAnimationFrame(frame)
          }
        }
      },
    }),

    // A track for one channel, drawn by `--color-slider-background`.
    slider: slot<ColorPickerSliderProps, ColorPickerSliderState>({
      props: { id: "id", channel: "string", orientation: "string" },
      state: (state, { api, props }) => sliderState(state, api, props),
      attrs: (state, { api, props }) => {
        const spec = api.internal.channel(props.channel)
        const vertical = props.orientation === "vertical"
        const direction = vertical
          ? "to top"
          : state.rtl
            ? "to left"
            : "to right"
        return {
          ...dataAttrs(state),
          "data-orientation": vertical ? "vertical" : "horizontal",
          "data-channel": spec.name,
          style: css({
            position: "relative",
            "touch-action": "none",
            "--color-slider-background": channelGradient(
              state.color,
              spec,
              direction
            ),
          }),
        }
      },
      on: {
        pointerdown: (event, { api, el, props }) =>
          el &&
          api.internal.sliderPointerdown(
            event,
            el,
            props.channel,
            props.orientation
          ),
      },
    }),

    "slider-thumb": slot<ColorPickerSliderProps, ColorPickerSliderState>({
      role: "slider",
      focus: "tab-stop",
      keys: sliderKeys,
      props: {
        id: { kind: "string", from: "slider" },
        channel: { kind: "string", from: "slider" },
        orientation: { kind: "string", from: "slider" },
      },
      state: (state, { api, props }) => sliderState(state, api, props),
      attrs: (state, { api, props }) => {
        const spec = api.internal.channel(props.channel)
        const value = readChannel(state.color, spec)
        const percent = percentOf(value, spec)
        const vertical = props.orientation === "vertical"
        return {
          tabindex: isDisabled(state) ? "-1" : "0",
          // English by default. Pass `aria-label` in another language.
          "aria-label": spec.label,
          "aria-valuemin": "0",
          "aria-valuemax": String(spec.max),
          "aria-valuenow": String(value),
          "aria-valuetext": valueText(value, spec),
          "aria-orientation": vertical ? "vertical" : "horizontal",
          "aria-disabled": isDisabled(state) ? "true" : undefined,
          "aria-readonly": state.readOnly ? "true" : undefined,
          ...dataAttrs(state),
          "data-orientation": vertical ? "vertical" : "horizontal",
          "data-channel": spec.name,
          style: css({
            position: "absolute",
            ...(vertical
              ? { bottom: `${percent}%` }
              : { "inset-inline-start": `${percent}%` }),
            "--color-slider-thumb-position": `${percent}%`,
          }),
        }
      },
      on: {
        keydown: (event, { api, props }) =>
          api.internal.sliderKeydown(event, props.channel),
      },
    }),

    // A text input that reads any CSS color on Enter or blur. Text that isn't
    // one goes back to the value; Escape puts the value back too.
    input: slot<{}, ColorPickerState>({
      state: pickerState,
      attrs: (state) => ({
        type: "text",
        value: state.text ?? state.value,
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        spellcheck: "false",
        disabled: isDisabled(state) ? "" : undefined,
        readonly: state.readOnly ? "" : undefined,
        ...dataAttrs(state),
      }),
      on: {
        input: (_event, { api, el }) =>
          el && api.internal.setText((el as HTMLInputElement).value),
        keydown: (event, { api, store }) => {
          if (event.key === "Enter") {
            api.internal.commitText(event)
          } else if (event.key === "Escape" && store.get().text !== null) {
            event.preventDefault()
            api.internal.revertText()
          }
        },
        focusout: (event, { api }) => api.internal.commitText(event),
      },
      bind(el, { api, store }) {
        const input = el as HTMLInputElement
        // The text is written here, so the framework never fights the caret.
        const write = () => {
          const { text, value } = store.get()
          const next = text ?? value
          if (input.value !== next) {
            input.value = next
          }
        }
        takeTypedText(
          input,
          () => [store.get().text ?? store.get().value],
          () => {
            api.internal.setText(input.value)
            if (!input.matches(":focus")) {
              api.internal.commitText()
            }
          }
        )
        write()
        return store.subscribe(write)
      },
    }),

    // A number input for one channel, in the units people read it in: 0 to
    // 255 for red, a percentage for saturation. It sets the channel on Enter,
    // blur or a step of its arrows.
    "channel-input": slot<ColorPickerChannelInputProps, ColorPickerState>({
      props: { id: "id", channel: "string" },
      state: pickerState,
      attrs: (state, { api, props }) => {
        const spec = api.internal.channel(props.channel)
        return {
          type: "number",
          inputmode: "decimal",
          min: "0",
          max: String(spec.max),
          step: String(spec.step),
          value: String(onStep(readChannel(state.color, spec), spec.step)),
          // English by default. Pass `aria-label` in another language.
          "aria-label": spec.label,
          disabled: isDisabled(state) ? "" : undefined,
          readonly: state.readOnly ? "" : undefined,
          ...dataAttrs(state),
          "data-channel": spec.name,
        }
      },
      on: {
        change: (event, { api, el, props }) => {
          const input = el as HTMLInputElement
          api.internal.setChannelValue(
            props.channel,
            input.valueAsNumber,
            event
          )
          input.value = String(
            onStep(api.internal.sliderValue(props.channel), Number(input.step))
          )
        },
      },
      bind(el, { api, store, props }) {
        const input = el as HTMLInputElement
        const write = () => {
          const next = String(
            onStep(api.internal.sliderValue(props.channel), Number(input.step))
          )
          if (
            input.ownerDocument.activeElement !== input &&
            input.value !== next
          ) {
            input.value = next
          }
        }
        write()
        input.addEventListener("blur", write)
        const unsubscribe = store.subscribe(write)
        return () => {
          unsubscribe()
          input.removeEventListener("blur", write)
        }
      },
    }),

    // The color itself, named for screen readers, like "dark vivid blue".
    swatch: slot<{}, ColorPickerState>({
      role: "img",
      state: pickerState,
      attrs: (state) => ({
        // English by default. Pass `aria-label` in another language.
        "aria-label": describeColor(shown(state.color, state.gamut)),
        ...dataAttrs(state),
        style: css({ "--color-picker-color": colorVariable(state) }),
      }),
    }),

    // Picks a color from anywhere on the screen, where the browser has the
    // EyeDropper API. Elsewhere it's disabled, with `data-unsupported`.
    "eye-dropper": slot<{}, ColorPickerState>({
      state: pickerState,
      attrs: (state) => ({
        type: "button",
        disabled:
          isLocked(state) || state.eyeDropper === false ? "" : undefined,
        "data-unsupported": state.eyeDropper === false ? "" : undefined,
        ...dataAttrs(state),
      }),
      press: ({ api, el }, event) => api.internal.pickFromScreen(el, event),
      bind: (el, { api }) => api.internal.setEyeDropper(el),
    }),

    swatches: slot<{}, ColorPickerState>({
      role: "listbox",
      keys: { none: "Focus stays on a swatch, whose keydown handles them." },
      state: pickerState,
      attrs: (state) => ({
        "aria-orientation": "horizontal",
        "aria-disabled": isDisabled(state) ? "true" : undefined,
        "aria-readonly": state.readOnly ? "true" : undefined,
        ...dataAttrs(state),
      }),
    }),

    // A preset color. Pressing it sets the value; arrows move between them.
    "swatch-item": slot<ColorPickerSwatchItemProps, ColorPickerSwatchItemState>(
      {
        role: "option",
        focus: "roving",
        keys: [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "Enter",
          " ",
        ],
        props: { value: "string" },
        state: (state, { api, props }) => ({
          selected: api.internal.isSelected(props.value),
          disabled: isLocked(state),
        }),
        attrs: (state, { api, key, props }) => {
          const selected = api.internal.isSelected(props.value)
          const color = parseColor(props.value)
          return {
            type: "button",
            "aria-selected": String(selected),
            // English by default. Pass `aria-label` in another language.
            "aria-label": color ? describeColor(color) : props.value,
            "aria-disabled": isLocked(state) ? "true" : undefined,
            tabindex: isDisabled(state)
              ? "-1"
              : api.internal.roving.tabIndex(state, { key, props }),
            "data-selected": selected ? "" : undefined,
            "data-disabled": isDisabled(state) ? "" : undefined,
            "data-readonly": state.readOnly ? "" : undefined,
            style: css({
              "--color-picker-color": color ? props.value : undefined,
            }),
          }
        },
        press: ({ api, props }, event) =>
          api.internal.choose(props.value, { reason: "item-press", event }),
        on: {
          keydown: (event, { api, el }) =>
            el && api.internal.roving.keydown(event, el),
        },
        bind: (el, part) => part.api.internal.roving.bind(el, part),
      }
    ),

    // React and Vue: the hidden input the form submits.
    "hidden-input": slot({
      attrs: (state) => ({
        type: "hidden",
        name: state.name,
        value: state.value,
        form: state.form,
        disabled: state.disabled ? "" : undefined,
      }),
      bind: (el, { api, store }) =>
        bindValueInput(el as HTMLInputElement, {
          value: () => store.get().value,
          subscribe: store.subscribe,
          focus: () => api.focus(),
          reset: api.internal.reset,
          disabled: api.internal.setFormDisabled,
        }),
    }),
  }
}

function sliderState(
  state: State,
  api: ColorPickerApi,
  props: ColorPickerSliderProps
) {
  const spec = api.internal.channel(props.channel)
  return {
    ...pickerState(state),
    channel: spec.name as ColorChannel,
    channelValue: readChannel(state.color, spec),
    orientation: props.orientation === "vertical" ? "vertical" : "horizontal",
  } satisfies ColorPickerSliderState
}

export { colorPickerSlots }
