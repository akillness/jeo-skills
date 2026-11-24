// A color picker around one value written as a CSS color. This module is the
// public API and assembles the primitive. State and the API live in
// color-picker-api.ts, and parts in color-picker-parts.ts.
import type { Color } from "../../foundation/color/convert"
import type { ColorFormat } from "../../foundation/color/format"
import type { ColorGamut } from "../../foundation/color/gamut"
import { createController } from "../../foundation/kernel/controller"
import type {
  ChangeDetails,
  ChangeOptions,
  CommitDetails,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import { colorPickerApi, initialState, syncState } from "./color-picker-api"
import type { ColorChannel, ColorPickerSpace } from "./color-picker-channels"
import { colorPickerSlots } from "./color-picker-parts"

/**
 * Why a color picker's value wants to change.
 * @experimental
 */
type ColorPickerValueChangeReason =
  | "track-press"
  | "drag"
  | "step-key"
  | "input-commit"
  | "item-press"
  | "eye-dropper-pick"
  | "reset"
  | "restore"
  | "imperative"

/**
 * What `onValueChange` receives after the value.
 * @experimental
 */
type ColorPickerValueChangeDetails =
  ChangeDetails<ColorPickerValueChangeReason> & {
    /** The new value as a color, in the picker's space, ready for `@ui-sdk/core/color`. */
    color: Color
  }

/**
 * What `onValueCommit` receives after the value.
 * @experimental
 */
type ColorPickerValueCommitDetails =
  CommitDetails<ColorPickerValueChangeReason> & {
    /** The value as a color, in the picker's space. */
    color: Color
  }

/**
 * Options for every write method on a controller.
 * @experimental
 */
type ColorPickerChangeOptions = ChangeOptions<ColorPickerValueChangeReason>

/**
 * Sets and inspects a color picker's value from outside it. Pass it as the `controller` option.
 * @experimental
 */
function createColorPickerController() {
  return createController<{
    /** The value, as a CSS color. */
    getValue: () => string
    /** Sets the value from any CSS color, as a user would. Returns false for text that isn't one. */
    setValue: (value: string, options?: ColorPickerChangeOptions) => boolean
    /** Moves focus to the area's thumb, or the first slider's. */
    focus: () => void
  }>()
}

/**
 * A controller from `createColorPickerController()`. Pass it as the `controller` option.
 * @experimental
 */
type ColorPickerController = ReturnType<typeof createColorPickerController>

/**
 * The options `colorPicker` takes. A component takes them as props on its root.
 * @experimental
 */
type ColorPickerOptions = {
  /** The value, as a CSS color, like `"#0ea5e9"` or `"oklch(0.62 0.19 259)"`. Pass it to control the picker. */
  value?: string
  /**
   * The value at first, when uncontrolled. A form reset returns to it.
   * @defaultValue black
   */
  defaultValue?: string
  /** Runs while the value changes: on every step of a drag or a key. `details.color` is the color, and `details.cancel()` stops it. */
  onValueChange?: (
    value: string,
    details: ColorPickerValueChangeDetails
  ) => void
  /** Runs once an interaction that changed the value ends: the pointer lifts, a key is pressed, a swatch is picked. For saving. */
  onValueCommit?: (
    value: string,
    details: ColorPickerValueCommitDetails
  ) => void
  /**
   * The space the parts edit in, which decides their channels: `"hsv"` has
   * hue, saturation and brightness, `"hsl"` hue, saturation and lightness,
   * `"srgb"` red, green and blue, `"oklch"` lightness, chroma and hue.
   * @defaultValue "hsv"
   */
  space?: ColorPickerSpace
  /**
   * How the value is written: `"hex"`, or a space in its CSS syntax, like `"oklch"`.
   * @defaultValue "hex" for `"hsv"`, which CSS can't write, and the space otherwise
   */
  format?: ColorFormat
  /**
   * The colors the value can hold. A drag can go past the edge, and the
   * value is the closest color inside it; once the drag ends, the picker
   * moves there too. `"p3"` allows wide-gamut screens' colors, and `false` any color.
   * @defaultValue "srgb"
   */
  gamut?: ColorGamut | false
  /** Disables every part: they can't be focused or changed, and the value isn't submitted. */
  disabled?: boolean
  /** Keeps the parts focusable and the value submitted, but stops changes. */
  readOnly?: boolean
  /** Marks it required, with `data-required`. A color picker always has a value, so it never blocks a form. */
  required?: boolean
  /** The name the value submits under. Without one, the picker submits nothing. */
  name?: string
  /** The id of a form to belong to, when it isn't inside that form. */
  form?: string
  /** Sets the value from anywhere. Create one with `createColorPickerController()`. */
  controller?: ColorPickerController
} & PrimitiveOptions

/**
 * The props the `area` slot of `colorPicker` takes, and its thumb and canvas.
 * @experimental
 */
type ColorPickerAreaProps = {
  /**
   * The channel across, left to right.
   * @defaultValue saturation, red or chroma, by space
   */
  x?: ColorChannel
  /**
   * The channel up, bottom to top.
   * @defaultValue brightness, lightness or green, by space
   */
  y?: ColorChannel
}

/**
 * The props the `slider` slot of `colorPicker` takes, and its thumb.
 * @experimental
 */
type ColorPickerSliderProps = {
  /**
   * The channel the slider edits, like `"hue"` or `"alpha"`.
   * @defaultValue hue, or blue in sRGB
   */
  channel?: ColorChannel
  /**
   * The slider's axis. Vertical sliders grow upward.
   * @defaultValue "horizontal"
   */
  orientation?: "horizontal" | "vertical"
}

/**
 * The props the `channel-input` slot of `colorPicker` takes.
 * @experimental
 */
type ColorPickerChannelInputProps = {
  /**
   * The channel the input edits, like `"hue"` or `"alpha"`.
   * @defaultValue hue, or blue in sRGB
   */
  channel?: ColorChannel
}

/**
 * The props the `swatch-item` slot of `colorPicker` takes.
 * @experimental
 */
type ColorPickerSwatchItemProps = {
  /** The color it picks, as any CSS color. */
  value: string
}

/**
 * What `render` functions and state-based class names receive.
 * @experimental
 */
type ColorPickerState = {
  /** The value, as a CSS color. */
  value: string
  /** The color the parts show, in the picker's space. During a drag it can be outside the gamut. */
  color: Color
  /** The space the parts edit in. */
  space: ColorPickerSpace
  /** Whether it's disabled, by itself or by a `<fieldset>`. */
  disabled: boolean
  /** Whether it's read-only: the parts stay focusable, but nothing changes the value. */
  readOnly: boolean
  /** Whether it's marked required. */
  required: boolean
  /** Whether the color the parts show is outside the gamut, so the value is the closest one inside. */
  outOfGamut: boolean
}

/**
 * The state the `slider` slot of `colorPicker` and its thumb hand `render`
 * functions and state-based class names.
 * @experimental
 */
type ColorPickerSliderState = ColorPickerState & {
  /** The channel the slider edits. */
  channel: ColorChannel
  /** The channel's value, in the units people read it in: degrees, percentages, 0 to 255 for red. */
  channelValue: number
  /** The slider's axis. */
  orientation: "horizontal" | "vertical"
}

/**
 * The state the `swatch-item` slot of `colorPicker` hands `render` functions
 * and state-based class names.
 * @experimental
 */
type ColorPickerSwatchItemState = {
  /** Whether the picker's color looks the same as this swatch's, whatever each is written in. */
  selected: boolean
  /** Whether pressing it changes nothing, since the picker is disabled or read-only. */
  disabled: boolean
}

const colorPickerPrimitive = /* @__PURE__ */ definePrimitive({
  name: "color-picker",
  options: {
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
    onValueCommit: "callback",
    space: "string",
    format: "string",
    gamut: (attribute) =>
      attribute === "false" ? false : (attribute ?? undefined),
    disabled: "boolean",
    readOnly: "boolean",
    required: "boolean",
    name: "string",
    form: "string",
    controller: "value",
  },
  state: initialState,
  sync: syncState,
  commits: ["value"],
  api: colorPickerApi,
  slots: colorPickerSlots,
  agent: { actions: ["setValue"] },
})

/**
 * The type of `colorPicker`.
 * @experimental
 */
interface ColorPickerPrimitive extends Named<typeof colorPickerPrimitive> {}

/**
 * The color picker primitive, with the slots `root`, `area`, `area-thumb`,
 * `area-canvas`, `slider`, `slider-thumb`, `input`, `channel-input`,
 * `swatch`, `eye-dropper`, `swatches`, `swatch-item`, `hidden-input`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @experimental
 */
const colorPicker = colorPickerPrimitive as ColorPickerPrimitive

export {
  colorPicker,
  createColorPickerController,
  type ColorPickerAreaProps,
  type ColorPickerChangeOptions,
  type ColorPickerChannelInputProps,
  type ColorPickerController,
  type ColorPickerOptions,
  type ColorPickerPrimitive,
  type ColorPickerSliderProps,
  type ColorPickerSliderState,
  type ColorPickerState,
  type ColorPickerSwatchItemProps,
  type ColorPickerSwatchItemState,
  type ColorPickerValueChangeDetails,
  type ColorPickerValueChangeReason,
  type ColorPickerValueCommitDetails,
}
export type { ColorPickerApi } from "./color-picker-api"
export type { ColorChannel, ColorPickerSpace } from "./color-picker-channels"
export type {
  Color,
  ColorFormat,
  ColorGamut,
} from "../../foundation/color/color"
