// Compiled by `pnpm typecheck`, never run. `<ui-textarea>` has the textarea's
// own options as properties, not only the input's.
import { expectTypeOf } from "vitest"
import "../src/entries/textarea"

const textarea = document.createElement("ui-textarea")
expectTypeOf(textarea.submitShortcut).toEqualTypeOf<
  "enter" | "mod+enter" | undefined
>()
expectTypeOf(textarea.autoResize).toEqualTypeOf<boolean>()
textarea.autoResize = true
textarea.submitShortcut = "mod+enter"
