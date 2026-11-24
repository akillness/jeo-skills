// What the rest of core may import from text's files. import-layers checks every
// import from another folder against this list. Nothing imports this file, so bundles
// don't pay for it.
export {
  accessibleName,
  hasAccessibleName,
  namedByContent,
  roleOf,
} from "./accessible-name"
export { textDiff, textFieldAdapter } from "./caret"
export { fuzzyFilter } from "./fuzzy"
export { createInputHistory, type InputHistoryOptions } from "./input-history"
export { bindPageLocale, localeOf, pageLocale } from "./locale"
export {
  foldText,
  leadingSpaces,
  matchRanges,
  type MatchSegment,
  matchSegments,
} from "./match"
export {
  type EditorChange,
  type EditorReplaceOptions,
  type TextEditorAdapter,
  type TextRange,
  type TextRect,
  type Token,
  type TokenInsert,
} from "./text-editor"
export {
  createTypeahead,
  isTypeaheadKey,
  labelOf,
  normalize,
  textOf,
} from "./typeahead"
