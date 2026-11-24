// Importing this defines <ui-trigger-menu> and its parts. On the server it does nothing.
import { defineTriggerMenuElements } from "../trigger-menu"

defineTriggerMenuElements()

export type {
  EditorChange,
  EditorReplaceOptions,
  ListFilter,
  ListItem,
  ListSeparator,
  TextEditorAdapter,
  TextRange,
  TextRect,
  Token,
  TokenInsert,
  TriggerAfter,
  TriggerArgument,
  TriggerBoundary,
  TriggerDefinition,
  TriggerItemsLoader,
  TriggerMatch,
  TriggerMenuApi,
  TriggerMenuChangeOptions,
  TriggerMenuContentProps,
  TriggerMenuContentState,
  TriggerMenuController,
  TriggerMenuData,
  TriggerMenuDataGroup,
  TriggerMenuDataItem,
  TriggerMenuDismissReason,
  TriggerMenuEmptyState,
  TriggerMenuHintState,
  TriggerMenuInputState,
  TriggerMenuItemIconProps,
  TriggerMenuItemIconState,
  TriggerMenuItemProps,
  TriggerMenuItemState,
  TriggerMenuOpenChangeReason,
  TriggerMenuOptions,
  TriggerMenuPrimitive,
  TriggerMenuQueryChangeReason,
  TriggerMenuSelectDetails,
  TriggerMenuStatusState,
  TriggerRule,
} from "@ui-sdk/core/trigger-menu"
export type { TriggerMenuEvents, UiTriggerMenuElement } from "../events"
export {
  createTriggerMenuController,
  textFieldAdapter,
} from "@ui-sdk/core/trigger-menu"
