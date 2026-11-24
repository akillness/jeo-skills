import { isDisabled } from "../../foundation/forms/form"
import { createController } from "../../foundation/kernel/controller"
import type {
  ChangeDetails,
  ChangeOptions,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveContext,
  PrimitiveOptions,
  SlotFactory,
} from "../../foundation/kernel/primitive-types"
import type { RadioGroupOptions } from "../radio/radio"
import {
  radioGroupApi,
  radioGroupState,
  syncRadioGroup,
  type RadioGroupStore,
} from "../radio/radio-api"
import {
  bindRadioGroup,
  radioGroupAttrs,
  radioSlots,
} from "../radio/radio-parts"

/**
 * Why a rating's value wants to change.
 * @experimental
 */
type RatingValueChangeReason =
  "item-press" | "list-navigation" | "reset" | "restore" | "imperative"

/**
 * Options for every write method on a controller.
 * @experimental
 */
type RatingChangeOptions = ChangeOptions<RatingValueChangeReason>

/**
 * Picks and inspects a rating's value from outside it. Pass it as the `controller` option.
 * @experimental
 */
function createRatingController() {
  return createController<{
    /** The score, or `null` before anyone rates. */
    getValue: () => number | null
    /** Sets the score, as a user would. Disabled and read-only ratings ignore it. */
    setValue: (value: number | null, details?: RatingChangeOptions) => boolean
    /** Moves focus to the checked star, or the first one. */
    focus: () => void
  }>()
}

/**
 * A controller from `createRatingController()`. Pass it as the `controller` option.
 * @experimental
 */
type RatingController = ReturnType<typeof createRatingController>

/**
 * The options `rating` takes. A component takes them as props on its root.
 * @experimental
 */
type RatingOptions = {
  /** The score. Pass it to control the rating. `null` means no score yet. */
  value?: number | null
  /** The score at first, when uncontrolled. A form reset returns to it. */
  defaultValue?: number | null
  /** Runs when a user or a form reset wants to change the score. `details.reason` says why, and `details.cancel()` stops it. */
  onValueChange?: (
    value: number | null,
    details: ChangeDetails<RatingValueChangeReason>
  ) => void
  /**
   * How many stars there are.
   * @defaultValue 5
   */
  max?: number
  /**
   * The smallest change, as a fraction of a star: `0.5` makes half stars,
   * each half its own radio.
   * @defaultValue 1
   */
  step?: number
  /** Lets a press on the checked star clear the score. */
  deselectable?: boolean
  /** Disables every star: they can't be focused or changed, and the score isn't submitted. */
  disabled?: boolean
  /** Shows the score as an image, named by `getValueLabel`, that can't be changed. Any score shows, like an average of 4.2. */
  readOnly?: boolean
  /** Blocks form submission until there's a score, with the browser's own message. */
  required?: boolean
  /** The name the score submits under. Without one, the rating submits nothing. */
  name?: string
  /** The id of a form to belong to, when the rating isn't inside that form. */
  form?: string
  /**
   * Whether arrow keys wrap from the last star to the first.
   * @defaultValue false
   */
  loop?: boolean
  /**
   * Names a score, for each star's radio and for a read-only rating.
   * @defaultValue (value) => value === 1 ? "1 star" : `${value} stars`
   */
  getValueLabel?: (value: number, max: number) => string
  /** Sets the score from anywhere. Create one with `createRatingController()`. */
  controller?: RatingController
} & PrimitiveOptions

/**
 * The props the `item` slot of `rating` takes.
 * @experimental
 */
type RatingItemProps = {
  /** Which star this is, from 1. */
  index: number
}

/**
 * What `render` functions and state-based class names receive.
 * @experimental
 */
type RatingState = {
  /** The score, or `null` before anyone rates. */
  value: number | null
  /** The score a pointer previews over the stars, or `null` while none does. */
  highlighted: number | null
  /** Whether the rating is disabled, by itself or by a `<fieldset>`. */
  disabled: boolean
  /** Whether the rating only shows its score. */
  readOnly: boolean
  /** Whether a form won't submit until there's a score. */
  required: boolean
}

/**
 * The state a star hands `render` functions and state-based class names.
 * @experimental
 */
type RatingItemState = {
  /** Which star this is, from 1. */
  index: number
  /** How much of this star the shown score covers, from 0 to 1. Also `--rating-fill`. */
  fill: number
  /** Whether the score ends in this star. */
  checked: boolean
  /** Whether a pointer previews a score that reaches this star. */
  highlighted: boolean
  /** Whether the rating is disabled, by itself or by a `<fieldset>`. */
  disabled: boolean
  /** Whether the rating only shows its score. */
  readOnly: boolean
}

const slotNames = { group: "root", item: "radio" }

const defaultLabel = (value: number) =>
  value === 1 ? "1 star" : `${value} stars`

const keyOf = (value: number | null | undefined) =>
  value === undefined ? undefined : value === null ? null : String(value)

const scoreOf = (key: string | null | undefined) =>
  key == null ? null : Number(key)

/**
 * The scores of the radios inside star `index`, lowest first: one per star,
 * or one per part of it with a `step` below 1.
 * @experimental
 */
function ratingItemValues(index: number, step = 1) {
  const parts = partsPerStar(step)
  return Array.from({ length: parts }, (_, part) =>
    Number((index - 1 + (part + 1) / parts).toFixed(4))
  )
}

const partsPerStar = (step: number) => Math.max(1, Math.round(1 / step))

// Rating keys its radios by score as text, so Radio's api and slots run it unchanged.
function radioOptions(options: RatingOptions) {
  const { onValueChange } = options
  return {
    value: keyOf(options.value),
    defaultValue: keyOf(options.defaultValue),
    onValueChange:
      onValueChange && ((key, details) => onValueChange(scoreOf(key), details)),
    disabled: options.disabled,
    readOnly: options.readOnly,
    required: options.required,
    name: options.name,
    form: options.form,
    loop: options.loop ?? false,
  } satisfies RadioGroupOptions
}

const fillOf = (state: RadioGroupStore, index: number) => {
  const shown = scoreOf(state.highlighted) ?? scoreOf(state.value) ?? 0
  return Math.min(1, Math.max(0, Number((shown - (index - 1)).toFixed(4))))
}

function itemState(state: RadioGroupStore, index: number) {
  const highlighted = scoreOf(state.highlighted)
  return {
    index,
    fill: fillOf(state, index),
    checked: state.value !== null && Math.ceil(Number(state.value)) === index,
    highlighted: highlighted !== null && index <= Math.ceil(highlighted),
    disabled: isDisabled(state),
    readOnly: state.readOnly,
  }
}

type RatingStore = RadioGroupStore & {
  max: number
  getValueLabel: RatingOptions["getValueLabel"]
}

// Labels live in state so a new `getValueLabel` or `max` renames the stars.
const labelSettings = (options: RatingOptions) => ({
  max: options.max ?? 5,
  getValueLabel: options.getValueLabel,
})

const labelOf = (state: RatingStore, value: number) =>
  (state.getValueLabel ?? defaultLabel)(value, state.max)

const interactive = (state: RadioGroupStore) =>
  !isDisabled(state) && !state.readOnly

function ratingApiBody(
  context: PrimitiveContext<RatingOptions, RatingStore, string>
) {
  const { store, options } = context
  const radio = radioGroupApi(
    {
      ...context,
      options: () => radioOptions(options()),
      onOptions: (listener) =>
        context.onOptions((next, synced) =>
          listener(radioOptions(next), synced)
        ),
    },
    slotNames
  )
  return {
    ...radio,
    getValue: () => scoreOf(radio.getValue()),
    setValue: (value: number | null, details?: RatingChangeOptions) =>
      radio.setValue(keyOf(value) ?? null, details),
    internal: {
      ...radio.internal,
      check: (key: string, details?: RatingChangeOptions) =>
        radio.setValue(
          key === store.get().value && options().deselectable ? null : key,
          details
        ),
      highlight(key: string | null) {
        if (store.get().highlighted !== key) {
          store.set({ highlighted: key })
        }
      },
      max: () => options().max ?? 5,
      partsPerStar: () => partsPerStar(options().step ?? 1),
      values: (index: number) => ratingItemValues(index, options().step ?? 1),
    },
  }
}

const ratingApi: (...args: Parameters<typeof ratingApiBody>) => RatingApi =
  ratingApiBody

/**
 * `rating`'s api, which its slots and controller call. Adapters expose it as `api`.
 * @experimental
 */
interface RatingApi extends ReturnType<typeof ratingApiBody> {}

const ratingPrimitive = /* @__PURE__ */ definePrimitive({
  name: "rating",
  options: {
    value: "number",
    defaultValue: "number",
    onValueChange: "callback",
    max: "number",
    step: "number",
    deselectable: "boolean",
    disabled: "boolean",
    readOnly: "boolean",
    required: "boolean",
    name: "string",
    form: "string",
    loop: "boolean",
    getValueLabel: "value",
    controller: "value",
  },
  state: (options: RatingOptions): RatingStore => ({
    ...radioGroupState(radioOptions(options), { highlighted: null }),
    ...labelSettings(options),
  }),
  sync: (options) => ({
    ...syncRadioGroup(radioOptions(options)),
    ...labelSettings(options),
  }),
  api: ratingApi,
  slots: (slot) => {
    const { item, input } = radioSlots(
      slot as unknown as SlotFactory<RadioGroupStore, RatingApi>,
      () => ({}),
      (state, key, api) => {
        const parts = api.internal.partsPerStar()
        const value = Number(key)
        const part = Math.round((value - Math.ceil(value) + 1) * parts)
        return {
          "aria-label": labelOf(state as RatingStore, value),
          // The radios split their star between them, under its icon.
          style: `position:absolute;inset-block:0;inset-inline-start:${((part - 1) / parts) * 100}%;width:${100 / parts}%;margin:0;padding:0;border:0;background:none`,
          // A read-only rating is one image, which names the score itself.
          ...(state.readOnly ? { "aria-hidden": "true", tabindex: "-1" } : {}),
        }
      }
    )
    return {
      root: slot<{}, RatingState>({
        role: (state) => (state.readOnly ? "img" : "radiogroup"),
        roles: ["radiogroup", "img"],
        keys: {
          none: "Focus stays on a star's radio, whose keydown handles them.",
        },
        state: (state) => ({
          value: scoreOf(state.value),
          highlighted: scoreOf(state.highlighted),
          disabled: isDisabled(state),
          readOnly: state.readOnly,
          required: state.required,
        }),
        attrs: (state, { api }) =>
          state.readOnly
            ? {
                "aria-label": labelOf(state, scoreOf(state.value) ?? 0),
                "data-readonly": "",
                "data-disabled": isDisabled(state) ? "" : undefined,
                "data-required": state.required ? "" : undefined,
              }
            : radioGroupAttrs(state),
        on: {
          pointermove: (event, { api, store }) => {
            if (event.pointerType === "touch" || !interactive(store.get())) {
              return
            }
            const radio = (event.target as Element).closest?.('[role="radio"]')
            const over = api.internal.roving
              .items()
              .find((entry) => entry.el === radio)
            if (over && !api.internal.itemProps(over.key).disabled) {
              api.internal.highlight(over.key)
            }
          },
          pointerleave: (_event, { api }) => api.internal.highlight(null),
        },
        bind: (el, { api, store }) => bindRadioGroup(el, api, store),
      }),
      item: slot<RatingItemProps, RatingItemState>({
        props: { index: "number" },
        state: (state, { props }) => itemState(state, props.index),
        attrs: (state, { props }) => {
          const { fill, checked, highlighted, disabled, readOnly } = itemState(
            state,
            props.index
          )
          return {
            "data-filled": fill === 1 ? "" : undefined,
            "data-partial": fill > 0 && fill < 1 ? "" : undefined,
            "data-checked": checked ? "" : undefined,
            "data-highlighted": highlighted ? "" : undefined,
            "data-disabled": disabled ? "" : undefined,
            "data-readonly": readOnly ? "" : undefined,
            style: `position:relative;--rating-fill:${fill}`,
          }
        },
      }),
      radio: item,
      input,
    }
  },
  agent: { actions: ["setValue"], closed: true },
})

/**
 * The type of `rating`.
 * @experimental
 */
interface RatingPrimitive extends Named<typeof ratingPrimitive> {}

/**
 * The rating primitive, with the slots `root`, `item`, `radio`, `input`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @experimental
 */
const rating = ratingPrimitive as RatingPrimitive

export {
  createRatingController,
  rating,
  ratingItemValues,
  type RatingApi,
  type RatingChangeOptions,
  type RatingController,
  type RatingItemProps,
  type RatingItemState,
  type RatingOptions,
  type RatingPrimitive,
  type RatingState,
  type RatingValueChangeReason,
}
