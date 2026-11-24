import type { TextEditorAdapter } from "@ui-sdk/core/trigger-menu"
import * as React from "react"

// The editor a TokenInput provides, apart from its parts, so a TriggerMenu
// inside it finds its editor without bundling the token input.
const EditorContext = React.createContext<TextEditorAdapter | undefined>(
  undefined
)

export { EditorContext }
