// Importing this defines <ui-label>. On the server it does nothing.
import { defineLabelElements } from "../label"

defineLabelElements()

export type { LabelOptions, LabelPrimitive } from "@ui-sdk/core/label"
export type { UiLabelElement } from "../events"
