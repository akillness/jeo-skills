// Importing this defines <ui-autocomplete> and its parts. On the server it does nothing.
import { defineAutocompleteElements } from "../autocomplete"

defineAutocompleteElements()

export type {
  AutocompleteApi,
  AutocompleteArrowState,
  AutocompleteChangeOptions,
  AutocompleteClearProps,
  AutocompleteClearState,
  AutocompleteContentProps,
  AutocompleteContentState,
  AutocompleteController,
  AutocompleteDismissReason,
  AutocompleteEmptyState,
  AutocompleteInputState,
  AutocompleteItemIconProps,
  AutocompleteItemIconState,
  AutocompleteItemProps,
  AutocompleteItemState,
  AutocompleteItemTextState,
  AutocompleteOpenChangeReason,
  AutocompleteOptions,
  AutocompletePrimitive,
  AutocompleteStatusState,
  AutocompleteSubmitDetails,
  AutocompleteTriggerState,
  AutocompleteValueChangeDetails,
  AutocompleteValueChangeReason,
  ListAnnouncement,
  ListData,
  ListFilter,
  ListGroup,
  ListHighlightDetails,
  ListItem,
  ListSeparator,
  MatchSegment,
  SearchFilter,
} from "@ui-sdk/core/autocomplete"
export type { AutocompleteEvents, UiAutocompleteElement } from "../events"
export { createAutocompleteController } from "@ui-sdk/core/autocomplete"
