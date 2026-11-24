import type { datePicker } from "@ui-sdk/core/date-picker"
import { getContext } from "svelte"
import type { useFieldControl } from "../field/context"
import type { PopupContainer } from "../popup.svelte"
import type { PrimitiveHandle } from "../use-primitive.svelte"

type DatePickerContext = PrimitiveHandle<typeof datePicker> & {
  field: ReturnType<typeof useFieldControl>
  /** The root's `months`, which the content's default grids follow. */
  months: () => number | undefined
}

const DatePickerKey = Symbol("date-picker")
// Where the popup renders. Set on <DatePicker> or <DatePickerContent>.
const ContainerKey = Symbol("date-picker-container")

type ContainerContext = () => PopupContainer

function useDatePicker(part: string) {
  const context = getContext<DatePickerContext | undefined>(DatePickerKey)
  if (!context) {
    throw new Error(`${part} must be used inside <DatePicker>.`)
  }
  return context
}

export {
  type ContainerContext,
  ContainerKey,
  type DatePickerContext,
  DatePickerKey,
  useDatePicker,
}
