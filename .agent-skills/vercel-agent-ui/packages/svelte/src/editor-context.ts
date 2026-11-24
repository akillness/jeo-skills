import type { TextEditorAdapter } from "@ui-sdk/core/trigger-menu"

// The editor a TokenInput provides, apart from its parts, so a TriggerMenu
// inside it finds its editor without bundling the token input.
const EditorKey = Symbol("text-editor")

type EditorContext = () => TextEditorAdapter | undefined

export { type EditorContext, EditorKey }
