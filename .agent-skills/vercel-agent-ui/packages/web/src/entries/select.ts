// Importing this defines <ui-select> and its parts. On the server it does nothing.
import { defineSelectElements } from "../select"

defineSelectElements()

export type {
  ListAnnouncement,
  ListData,
  ListFilter,
  ListGroup,
  ListHighlightDetails,
  ListItem,
  ListSeparator,
  MatchSegment,
  SelectApi,
  SelectArrowState,
  SelectChangeOptions,
  SelectClearProps,
  SelectClearState,
  SelectContentProps,
  SelectContentState,
  SelectController,
  SelectDismissReason,
  SelectEmptyState,
  SelectInputState,
  SelectItemIconProps,
  SelectItemIconState,
  SelectItemIndicatorProps,
  SelectItemIndicatorState,
  SelectItemProps,
  SelectItemState,
  SelectItemTextState,
  SelectOpenChangeReason,
  SelectOptions,
  SelectPrimitive,
  SelectQueryChangeReason,
  SelectSelectAllState,
  SelectStatusState,
  SelectTriggerProps,
  SelectTriggerState,
  SelectValue,
  SelectValueChangeReason,
  SelectValueProps,
  SelectValueState,
} from "@ui-sdk/core/select"
export type { SelectEvents, UiSelectElement } from "../events"
export { createSelectController } from "@ui-sdk/core/select"
