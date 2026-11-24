// Importing this defines <ui-meter> and its parts. On the server it does nothing.
import { defineMeterElements } from "../meter"

defineMeterElements()

export type {
  MeterLabelDetails,
  MeterOptions,
  MeterPrimitive,
  MeterState,
  MeterValueState,
  NumberFormat,
} from "@ui-sdk/core/meter"
export type { UiMeterElement } from "../events"
