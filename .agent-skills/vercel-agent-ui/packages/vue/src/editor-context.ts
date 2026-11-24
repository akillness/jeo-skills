import type { TextEditorAdapter } from "@ui-sdk/core/trigger-menu"
import type { InjectionKey } from "vue"

// The editor a TokenInput provides, apart from its parts, so a TriggerMenu
// inside it finds its editor without bundling the token input.
const EditorKey: InjectionKey<() => TextEditorAdapter | undefined> =
  Symbol("text-editor")

export { EditorKey }
