import { definePrimitive, live } from "../src/index"

// A slot that declares a role has to say how it meets what the role needs:
// focus, a press and keys, or for focus and keys, why another element does.
// Each case fails to compile on its own, so an agent can't leave one out.

const press = () => {}
const keydown = () => {}
const selected = () => ({ "aria-selected": "false" })

definePrimitive({
  name: "roles",
  state: () => ({}),
  api: () => ({}),
  slots: (slot) => ({
    option: slot({ role: "option", focus: "roving", press, attrs: selected }),
    // An option takes focus and activates, so it says how.
    // @ts-expect-error No `focus` or `press`.
    bare: slot({ role: "option" }),
    // @ts-expect-error No `focus`.
    pressOnly: slot({ role: "option", press }),
    elsewhere: slot({
      role: "option",
      focus: { none: "The combobox's input keeps focus." },
      press,
      attrs: selected,
    }),
    list: slot({
      role: "listbox",
      keys: ["ArrowUp", "ArrowDown", "Home", "End", "typeahead"],
      on: { keydown },
    }),
    // @ts-expect-error No `keys`.
    unkeyed: slot({ role: "listbox", on: { keydown } }),
    inputKeys: slot({
      role: "listbox",
      keys: { none: "The combobox's input handles them." },
    }),
    // @ts-expect-error Keys with no keydown handler to press them.
    unhandled: slot({ role: "listbox", keys: ["ArrowDown"] }),
    // On a role that doesn't ask for keys, development builds check it instead,
    // which keeps checking every slot cheap.
    unhandledGroup: slot({ role: "group", keys: ["Enter"] }),
    // @ts-expect-error Not a WAI-ARIA role.
    typo: slot({ role: "lisbox" }),
    // A role picked from state lists every role it can pick.
    picked: slot({ role: () => "none", roles: ["none", "separator"] }),
    // @ts-expect-error No `roles`.
    unlisted: slot({ role: () => "none" }),
    group: slot({ role: "group" }),
    plain: slot({ attrs: () => ({ type: "button" }) }),

    // A role's required states are always written, even as `undefined`,
    // and attributes the role doesn't take don't compile.
    // @ts-expect-error No `aria-checked`.
    unchecked: slot({
      role: "checkbox",
      focus: "native",
      press,
      attrs: () => ({ type: "button" }),
    }),
    checkedLater: slot({
      role: "checkbox",
      focus: "native",
      press,
      attrs: () => ({ "aria-checked": undefined }),
    }),
    // Kept current with `live` instead: `attrs` still names it.
    liveSelected: slot({
      role: "option",
      focus: "roving",
      press,
      attrs: () => ({ "aria-selected": undefined }),
      live: live(selected),
    }),
    // @ts-expect-error A group has no orientation.
    orientedGroup: slot({
      role: "group",
      attrs: () => ({ "aria-orientation": "vertical" }),
    }),
    orientedList: slot({
      role: "listbox",
      keys: ["ArrowDown"],
      on: { keydown },
      attrs: () => ({ "aria-orientation": "vertical" }),
    }),
    // @ts-expect-error `none` can't be named.
    namedNone: slot({
      role: "none",
      attrs: () => ({ "aria-label": "Divider" }),
    }),
    // Without a literal role, development builds check instead.
    pickedAria: slot({
      role: () => "none",
      roles: ["none", "separator"],
      attrs: () => ({ "aria-orientation": "vertical" }),
    }),
  }),
})
