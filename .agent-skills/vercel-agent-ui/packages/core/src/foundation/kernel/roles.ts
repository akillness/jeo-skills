// The roles a part can declare, and what each asks of its slot: one list per
// need, read by the slot types and by development builds alike.

const roles = [
  "alert",
  "alertdialog",
  "application",
  "article",
  "banner",
  "blockquote",
  "button",
  "caption",
  "cell",
  "checkbox",
  "code",
  "columnheader",
  "combobox",
  "complementary",
  "contentinfo",
  "definition",
  "deletion",
  "dialog",
  "document",
  "emphasis",
  "feed",
  "figure",
  "form",
  "generic",
  "grid",
  "gridcell",
  "group",
  "heading",
  "img",
  "insertion",
  "link",
  "list",
  "listbox",
  "listitem",
  "log",
  "main",
  "marquee",
  "math",
  "menu",
  "menubar",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "meter",
  "navigation",
  "none",
  "note",
  "option",
  "paragraph",
  "presentation",
  "progressbar",
  "radio",
  "radiogroup",
  "region",
  "row",
  "rowgroup",
  "rowheader",
  "scrollbar",
  "search",
  "searchbox",
  "separator",
  "slider",
  "spinbutton",
  "status",
  "strong",
  "subscript",
  "superscript",
  "switch",
  "tab",
  "table",
  "tablist",
  "tabpanel",
  "term",
  "textbox",
  "time",
  "timer",
  "toolbar",
  "tooltip",
  "tree",
  "treegrid",
  "treeitem",
] as const

// Not `separator`, which takes focus only as a window splitter.
const focusableRoles = [
  "button",
  "checkbox",
  "combobox",
  "gridcell",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
] as const

const pressableRoles = [
  "button",
  "checkbox",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "switch",
  "tab",
  "treeitem",
] as const

const keyedRoles = [
  "combobox",
  "grid",
  "listbox",
  "menu",
  "menubar",
  "radiogroup",
  "slider",
  "spinbutton",
  "tablist",
  "toolbar",
  "tree",
  "treegrid",
] as const

// Each role-specific ARIA attribute, with the roles that support it, from
// WAI-ARIA 1.2 with what subclass roles inherit. Global ones, like
// `aria-label` and `aria-describedby`, aren't listed: every role takes them.
const ariaSupport = {
  "aria-activedescendant": [
    "application",
    "combobox",
    "grid",
    "group",
    "listbox",
    "menu",
    "menubar",
    "radiogroup",
    "row",
    "searchbox",
    "spinbutton",
    "tablist",
    "textbox",
    "toolbar",
    "tree",
    "treegrid",
  ],
  "aria-autocomplete": ["combobox", "searchbox", "textbox"],
  "aria-checked": [
    "checkbox",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "radio",
    "switch",
    "treeitem",
  ],
  "aria-colcount": ["grid", "table", "treegrid"],
  "aria-colindex": ["cell", "columnheader", "gridcell", "row", "rowheader"],
  "aria-colspan": ["cell", "columnheader", "gridcell", "rowheader"],
  "aria-expanded": [
    "application",
    "button",
    "checkbox",
    "columnheader",
    "combobox",
    "gridcell",
    "link",
    "listbox",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "row",
    "rowheader",
    "switch",
    "tab",
    "treeitem",
  ],
  "aria-level": ["heading", "listitem", "row", "treeitem"],
  "aria-modal": ["alertdialog", "dialog"],
  "aria-multiline": ["searchbox", "textbox"],
  "aria-multiselectable": ["grid", "listbox", "tablist", "tree", "treegrid"],
  "aria-orientation": [
    "listbox",
    "menu",
    "menubar",
    "radiogroup",
    "scrollbar",
    "separator",
    "slider",
    "tablist",
    "toolbar",
    "tree",
    "treegrid",
  ],
  "aria-placeholder": ["searchbox", "textbox"],
  "aria-posinset": [
    "article",
    "listitem",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "radio",
    "row",
    "tab",
    "treeitem",
  ],
  "aria-pressed": ["button"],
  "aria-readonly": [
    "checkbox",
    "columnheader",
    "combobox",
    "grid",
    "gridcell",
    "listbox",
    "menuitemcheckbox",
    "menuitemradio",
    "radiogroup",
    "rowheader",
    "searchbox",
    "slider",
    "spinbutton",
    "switch",
    "textbox",
  ],
  "aria-required": [
    "checkbox",
    "columnheader",
    "combobox",
    "gridcell",
    "listbox",
    "radiogroup",
    "rowheader",
    "searchbox",
    "spinbutton",
    "switch",
    "textbox",
    "tree",
    "treegrid",
  ],
  "aria-rowcount": ["grid", "table", "treegrid"],
  "aria-rowindex": ["cell", "columnheader", "gridcell", "row", "rowheader"],
  "aria-rowspan": ["cell", "columnheader", "gridcell", "rowheader"],
  "aria-selected": [
    "columnheader",
    "gridcell",
    "option",
    "row",
    "rowheader",
    "tab",
    "treeitem",
  ],
  "aria-setsize": [
    "article",
    "listitem",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "radio",
    "row",
    "tab",
    "treeitem",
  ],
  "aria-sort": ["columnheader", "rowheader"],
  "aria-valuemax": [
    "meter",
    "progressbar",
    "scrollbar",
    "separator",
    "slider",
    "spinbutton",
  ],
  "aria-valuemin": [
    "meter",
    "progressbar",
    "scrollbar",
    "separator",
    "slider",
    "spinbutton",
  ],
  "aria-valuenow": [
    "meter",
    "progressbar",
    "scrollbar",
    "separator",
    "slider",
    "spinbutton",
  ],
  "aria-valuetext": [
    "meter",
    "progressbar",
    "scrollbar",
    "separator",
    "slider",
    "spinbutton",
  ],
} as const satisfies Record<string, readonly (typeof roles)[number][]>

// Roles that can't be named: an `aria-label` on them is ignored.
const namelessRoles = [
  "caption",
  "code",
  "deletion",
  "emphasis",
  "generic",
  "insertion",
  "none",
  "paragraph",
  "presentation",
  "strong",
  "subscript",
  "superscript",
] as const

// The states a role's pattern can't work without, which its slot's `attrs` must always write.
const requiredStates = {
  checkbox: ["aria-checked"],
  combobox: ["aria-expanded"],
  menuitemcheckbox: ["aria-checked"],
  menuitemradio: ["aria-checked"],
  meter: ["aria-valuenow"],
  option: ["aria-selected"],
  radio: ["aria-checked"],
  slider: ["aria-valuenow"],
  switch: ["aria-checked"],
  tab: ["aria-selected"],
} as const satisfies Partial<
  Record<(typeof roles)[number], readonly (keyof typeof ariaSupport)[]>
>

/**
 * A WAI-ARIA role a part can declare with its slot's `role`.
 */
type Role = (typeof roles)[number]

type RoleAria = keyof typeof ariaSupport

// The role-specific attributes a role takes, and the states it requires.
type AriaOf<R> = {
  [K in RoleAria]: R extends (typeof ariaSupport)[K][number] ? K : never
}[RoleAria]
type RequiredAria<R> = R extends keyof typeof requiredStates
  ? (typeof requiredStates)[R][number]
  : never
type NamelessRole = (typeof namelessRoles)[number]

type FocusableRole = (typeof focusableRoles)[number]
type PressableRole = (typeof pressableRoles)[number]
type KeyedRole = (typeof keyedRoles)[number]

/**
 * How a part that takes focus gets it. `"roving"`: one of a set holds the tab
 * stop, and keys move it. `"tab-stop"`: always in the tab order.
 * `"active-descendant"`: focus stays on another element, which points at the
 * part with `aria-activedescendant`. `"native"`: the element focuses on its
 * own, like a `<button>` or an `<input>`.
 */
type Focus = "roving" | "tab-stop" | "active-descendant" | "native"

/**
 * A key a part handles, by `KeyboardEvent.key`, or `"typeahead"` for typed
 * characters that move to a matching item. Modifiers are written as in
 * shortcuts, like `"mod+a"`.
 */
type HandledKey =
  | "ArrowUp"
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight"
  | "Home"
  | "End"
  | "PageUp"
  | "PageDown"
  | "Enter"
  | " "
  | "Escape"
  | "Tab"
  | "typeahead"
  | (string & {})

/**
 * A need a slot's role has that another element meets, with the reason, like
 * `keys: { none: "The combobox's input handles them." }`.
 */
type Unneeded = { none: string }

const focusable = new Set<string>(focusableRoles)
const pressable = new Set<string>(pressableRoles)
const keyed = new Set<string>(keyedRoles)

/**
 * The needs a role has that a slot doesn't meet: `"keydown"` when it lists
 * `keys` with no `on.keydown` to handle them.
 */
function unmetNeeds(
  role: string,
  slot: {
    focus?: unknown
    press?: unknown
    keys?: unknown
    on?: { keydown?: unknown }
  }
) {
  const unmet: ("focus" | "press" | "keys" | "keydown")[] = []
  if (focusable.has(role) && !slot.focus) {
    unmet.push("focus")
  }
  if (pressable.has(role) && !slot.press) {
    unmet.push("press")
  }
  if (keyed.has(role) && !slot.keys) {
    unmet.push("keys")
  }
  if (
    (Array.isArray(slot.keys) || typeof slot.keys === "function") &&
    !slot.on?.keydown
  ) {
    unmet.push("keydown")
  }
  return unmet
}

const knownRoles = new Set<string>(roles)

const naming = ["aria-label", "aria-labelledby"]

// States an input exposes on its own, by its `type`, like a range input's value.
const nativeStates: Record<string, readonly string[]> = {
  checkbox: ["aria-checked"],
  number: ["aria-valuenow"],
  radio: ["aria-checked"],
  range: ["aria-valuenow"],
}

/**
 * The ARIA attributes a part renders that its role doesn't take, and the
 * states the role requires that it renders without, like `aria-checked` on a checkbox.
 */
function ariaProblems(role: string, attrs: Record<string, unknown>) {
  const notAllowed: string[] = []
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined) {
      continue
    }
    const supported = (ariaSupport as Record<string, readonly string[]>)[name]
    if (supported && !supported.includes(role)) {
      notAllowed.push(name)
    }
    if (
      naming.includes(name) &&
      (namelessRoles as readonly string[]).includes(role)
    ) {
      notAllowed.push(name)
    }
  }
  const required =
    (requiredStates as Record<string, readonly string[] | undefined>)[role] ??
    []
  const native = nativeStates[attrs.type as string] ?? []
  return {
    notAllowed,
    missing: required.filter(
      (name) => attrs[name] === undefined && !native.includes(name)
    ),
  }
}

export {
  type AriaOf,
  ariaProblems,
  type Focus,
  type FocusableRole,
  type HandledKey,
  type KeyedRole,
  knownRoles,
  type NamelessRole,
  type PressableRole,
  type RequiredAria,
  type RoleAria,
  type Role,
  type Unneeded,
  unmetNeeds,
}
