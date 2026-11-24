// Checks a rendered widget against its WAI-ARIA pattern, the way a keyboard
// and screen reader user would meet it: roles, states and references first,
// then the pattern's keys, pressed from the focused element. Every problem
// is collected and thrown in one error. Keysmash's invariants, without the
// fuzzer.
import { createContext, stopped, type PatternContext } from "./pattern-context"
import {
  accordion,
  checkbox,
  disclosure,
  slider,
  switchPattern,
} from "./pattern-controls"
import {
  listbox,
  menubar,
  radioGroup,
  tabs,
  toolbar,
  tree,
} from "./pattern-lists"
import { alertdialog, combobox, dialog, menu } from "./pattern-popups"

/**
 * A WAI-ARIA Authoring Practices pattern, by its APG name.
 * @experimental
 */
type Pattern =
  | "listbox"
  | "menu"
  | "menubar"
  | "tabs"
  | "radio-group"
  | "toolbar"
  | "tree"
  | "dialog"
  | "alertdialog"
  | "disclosure"
  | "accordion"
  | "combobox"
  | "slider"
  | "switch"
  | "checkbox"

const checks: Partial<
  Record<Pattern, (context: PatternContext) => Promise<void>>
> = {
  listbox,
  menu,
  menubar,
  tabs,
  "radio-group": radioGroup,
  toolbar,
  tree,
  dialog,
  alertdialog,
  disclosure,
  accordion,
  combobox,
  slider,
  switch: switchPattern,
  checkbox,
}

/**
 * Checks a rendered widget against its WAI-ARIA pattern, and throws one
 * error that lists every problem, each with its element and rule, or returns
 * nothing when there are none. `root` is the widget's element or one around
 * it; a popup's trigger finds a popup rendered elsewhere. Open a menu or a
 * dialog before checking it.
 *
 * It checks roles, required states, names and id references, one tab stop
 * per composite, then drives the pattern's keys from the focused element:
 * arrows (by `aria-orientation`, swapped right to left), Home and End,
 * typeahead, Escape, Enter and Space. After every key, focus must not fall to
 * the body or land in `aria-hidden` or `inert` content. It puts focus and
 * state back where it can; a menu check presses Enter on an item, which runs
 * its action.
 *
 * It holds widgets to more than the APG's letter in three places: Home and
 * End are required in a listbox, tabs and a toolbar, where the APG makes them
 * optional; a modal dialog, one that makes the page behind it inert, needs
 * `aria-modal="true"`; and a tablist needs a name.
 *
 * @example
 * const view = mount(tabs, { defaultValue: "a" }, markup)
 * await checkPattern(view.root, "tabs")
 *
 * @experimental
 */
async function checkPattern(root: Element, pattern: Pattern) {
  const check = checks[pattern]
  if (!check) {
    throw new Error(
      `checkPattern doesn't support "${pattern}" yet. It supports ${Object.keys(checks).join(", ")}.`
    )
  }
  const context = createContext(root)
  context.checkReferences()
  try {
    await check(context)
  } catch (error) {
    if (error !== stopped) {
      throw error
    }
  }
  const problems = [...context.problems]
  if (!problems.length) {
    return
  }
  const count = `${problems.length} problem${problems.length === 1 ? "" : "s"}`
  throw new Error(
    `checkPattern found ${count} with the ${pattern} pattern:\n${problems.map((problem) => `- ${problem}`).join("\n")}`
  )
}

export { checkPattern, type Pattern }
