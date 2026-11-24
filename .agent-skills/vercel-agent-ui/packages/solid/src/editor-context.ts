import type { TextEditorAdapter } from "@ui-sdk/core/trigger-menu"
import { createContext } from "solid-js"

// The editor a TokenInput provides, apart from its parts, so a TriggerMenu
// inside it finds its editor without bundling the token input. A getter, so
// a menu rendered before the token input mounts reads it when it needs it.
const EditorContext = createContext<() => TextEditorAdapter | undefined>(
  () => undefined
)

export { EditorContext }
