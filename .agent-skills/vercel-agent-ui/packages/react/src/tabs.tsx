import { tabs } from "@ui-sdk/core/tabs"
import { createParts } from "./use-primitive"

const parts = createParts(tabs, {
  root: "div",
  list: "div",
  tab: "button",
  "tab-icon": "span",
  indicator: "span",
  panel: "div",
})

/**
 * Layered sections of content, one shown at a time.
 * `T` is inferred from `value`, `defaultValue` or `onValueChange`.
 * @stable
 */
const Tabs = parts.Root

/**
 * The row of tabs, a tablist with one tab stop and arrow keys between its tabs.
 * @stable
 */
const TabsList = parts.List

/**
 * A tab. Selecting it shows the panel with the same `value`.
 * @stable
 */
const TabsTab = parts.Tab

/**
 * An icon inside a tab. A tab with only an icon needs an `aria-label`. Screen readers skip it, and
 * `mirror` flips it in right-to-left text.
 * @stable
 */
const TabsTabIcon = parts.TabIcon

/**
 * Marks the selected tab. Its box comes from the `--active-tab-*` variables, measured from the tab list.
 * @stable
 */
const TabsIndicator = parts.Indicator

/**
 * The content of the tab with the same `value`, shown while that tab is selected.
 * @stable
 */
const TabsPanel = parts.Panel

export { createTabsController } from "@ui-sdk/core/tabs"
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

export { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab, TabsTabIcon }
