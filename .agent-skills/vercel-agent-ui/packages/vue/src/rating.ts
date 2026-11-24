import type { ChangeDetails } from "@ui-sdk/core"
import {
  rating,
  ratingItemValues,
  type RatingController,
  type RatingState,
  type RatingValueChangeReason,
} from "@ui-sdk/core/rating"
import {
  defineComponent,
  h,
  inject,
  provide,
  type InjectionKey,
  type PropType,
} from "vue"
import { withElement } from "./create-parts"
import { useFieldControl } from "./field-context"
import { readOnlyOf } from "./text-control"
import {
  optionalBoolean,
  orModel,
  usePart,
  usePrimitive,
  useScope,
  type PartSlots,
} from "./use-primitive"

const ItemKey: InjectionKey<{ index: number; step: number }> =
  Symbol("rating-item")

const ItemScope = defineComponent({
  name: "RatingItemScope",
  props: {
    index: { type: Number, required: true },
    step: { type: Number, required: true },
  },
  setup(props, { slots }) {
    provide(ItemKey, props)
    return () => slots.default?.()
  },
})

/**
 * A score picked from a row of stars, a radio per star or half star, with a
 * preview while a pointer moves over them. Its default slot renders once per star.
 * @experimental
 */
const Rating = withElement(
  "div",
  defineComponent({
    name: "Rating",
    inheritAttrs: false,
    props: {
      value: { type: Number as PropType<number | null>, default: undefined },
      modelValue: {
        type: Number as PropType<number | null>,
        default: undefined,
      },
      defaultValue: {
        type: Number as PropType<number | null>,
        default: undefined,
      },
      max: { type: Number, default: 5 },
      step: { type: Number, default: 1 },
      deselectable: optionalBoolean,
      disabled: optionalBoolean,
      readOnly: optionalBoolean,
      required: optionalBoolean,
      name: String,
      form: String,
      loop: optionalBoolean,
      getValueLabel: Function as PropType<
        (value: number, max: number) => string
      >,
      controller: Object as PropType<RatingController>,
      debug: optionalBoolean,
    },
    emits: {
      "update:value": (_value: number | null) => true,
      "update:modelValue": (_value: number | null) => true,
      valueChange: (
        _value: number | null,
        _details: ChangeDetails<RatingValueChangeReason>
      ) => true,
    },
    slots: Object as PartSlots<typeof rating, "root">,
    setup(props, { attrs, emit, slots }) {
      const field = useFieldControl()
      const control = usePrimitive(rating, () => ({
        value: orModel(props.value, props.modelValue),
        defaultValue: props.defaultValue,
        max: props.max,
        step: props.step,
        deselectable: props.deselectable,
        disabled: props.disabled || field?.disabled(),
        readOnly: readOnlyOf(props, attrs),
        required: props.required,
        name: props.name ?? field?.name(),
        form: props.form,
        loop: props.loop,
        getValueLabel: props.getValueLabel,
        controller: props.controller,
        debug: props.debug,
        onValueChange: (
          value: number | null,
          details: ChangeDetails<RatingValueChangeReason>
        ) => {
          // The change event runs first, so canceling it also keeps v-model as it was.
          emit("valueChange", value, details)
          if (details.canceled) {
            return
          }
          emit("update:value", value)
          emit("update:modelValue", value)
        },
      }))
      const stars = (state: RatingState) =>
        Array.from({ length: props.max }, (_, at) =>
          h(
            ItemScope,
            { key: at, index: at + 1, step: props.step },
            () => slots.default?.({ state }) ?? h(RatingItem)
          )
        )
      return usePart(control, "root", undefined, undefined, {
        tag: "div",
        extend: field?.props,
        children: stars,
      })
    },
  })
)

const RatingRadio = defineComponent({
  name: "RatingRadio",
  props: { value: { type: String, required: true } },
  setup(props) {
    const control = useScope(rating)!.handle
    const radio = () => ({ value: props.value })
    const button = usePart(control, "radio", radio, () => ({}), "button")
    return () => [button(), h("input", control.slot("input", radio()))]
  },
})

/**
 * One star. Put its icon inside: the slot gets how full it is, and the radios
 * that pick its score sit over it.
 * @experimental
 */
const RatingItem = withElement(
  "span",
  defineComponent({
    name: "RatingItem",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof rating, "item">,
    setup(_, { slots }) {
      const item = inject(ItemKey, null)
      if (!item) {
        throw new Error("RatingItem must be used inside <Rating>.")
      }
      const radios = () =>
        ratingItemValues(item.index, item.step).map((score) =>
          h(RatingRadio, { key: score, value: String(score) })
        )
      return usePart(rating, "item", () => ({ index: item.index }), undefined, {
        tag: "span",
        children: (state) => [slots.default?.({ state }), radios()],
      })
    },
  })
)

export { createRatingController } from "@ui-sdk/core/rating"
export type {
  RatingApi,
  RatingChangeOptions,
  RatingController,
  RatingItemProps,
  RatingItemState,
  RatingOptions,
  RatingPrimitive,
  RatingState,
  RatingValueChangeReason,
} from "@ui-sdk/core/rating"

export { Rating, RatingItem }
