// Importing this defines <ui-tabs> and its parts. On the server it does nothing.
import { defineTabsElements } from "../tabs"

defineTabsElements()

export type {
  TabsApi,
  TabsChangeOptions,
  TabsController,
  TabsDirection,
  TabsIndicatorState,
  TabsListState,
  TabsOptions,
  TabsOrientation,
  TabsPanelProps,
  TabsPanelState,
  TabsPrimitive,
  TabsState,
  TabsTabIconProps,
  TabsTabIconState,
  TabsTabProps,
  TabsTabState,
  TabsValueChangeReason,
} from "@ui-sdk/core/tabs"
export type { TabsEvents, UiTabsElement } from "../events"
export { createTabsController } from "@ui-sdk/core/tabs"
