// The patterns that open over the page: menu (with its menu button),
// dialog, alert dialog and combobox. Each checks the open popup and its
// trigger, drives its keys, and opens it again when a key closed it.
import { describe, ids, isRtl, roleOf, tabStops, withRole } from "./aria"
import {
  checkNavigation,
  checkTabStop,
  checkTypeahead,
  currentItem,
  expectStep,
  returnTo,
  type Composite,
} from "./composite"
import {
  arrowsFor,
  checkOwned,
  findWidget,
  isShown,
  orientationOf,
  popupOf,
  requireName,
  triggerOf,
  type PatternContext,
} from "./pattern-context"
import { menuItemRoles, ownItems } from "./pattern-lists"
import { isDisabledElement } from "../foundation/forms/form"

// Presses `key` on the trigger, and checks it opened the popup with focus inside.
async function reopen(
  context: PatternContext,
  trigger: Element,
  key: string,
  roles: string[],
  source: string
) {
  if (context.doc.activeElement !== trigger) {
    return undefined
  }
  await context.press(key)
  const popup = popupOf(trigger, roles)
  if (!popup || !isShown(popup)) {
    context.problem(
      trigger,
      `${key} should open its ${roles[0]} (APG ${source}).`
    )
    return undefined
  }
  context.watch(popup)
  if (!popup.contains(context.doc.activeElement)) {
    context.problem(
      popup,
      `opened with ${key}, but focus stayed on ${describe(context.doc.activeElement)}; it moves into the ${roles[0]} (APG ${source}).`
    )
  }
  return popup
}

// Escape closes the popup and returns focus to its trigger.
async function checkEscape(
  context: PatternContext,
  popup: Element,
  trigger: Element | undefined,
  source: string
) {
  await context.press("Escape")
  const now = (popup.id && context.doc.getElementById(popup.id)) || popup
  if (isShown(now)) {
    context.problem(popup, `Escape should close it (APG ${source}).`)
    return false
  }
  const active = context.doc.activeElement
  if (trigger && active !== trigger) {
    context.problem(
      trigger,
      `focus should return here when Escape closes ${describe(popup)}, but went to ${describe(active)} (APG ${source}).`
    )
  }
  return true
}

/** Menu: an open menu and its button, items with their states, arrows, Home and End, typeahead, Escape and Enter. */
async function menu(context: PatternContext) {
  const popup = findWidget(context, ["menu"])
  if (!popup || !isShown(popup)) {
    context.problem(
      context.root,
      "has no open menu; open it before checking the menu pattern."
    )
    return
  }
  context.watch(popup)
  const trigger = triggerOf(popup)
  if (trigger) {
    context.watch(trigger)
    if (
      !["menu", "true"].includes(trigger.getAttribute("aria-haspopup") ?? "")
    ) {
      context.problem(
        trigger,
        `opens a menu, so it has aria-haspopup="menu" or "true" (APG menu button).`
      )
    }
    if (trigger.getAttribute("aria-expanded") !== "true") {
      context.problem(
        trigger,
        `has aria-expanded="true" while its menu is open (APG menu button).`
      )
    }
  }
  checkOwned(context, popup, menuItemRoles, "menu")
  const items = ownItems(popup)
  if (!items.length) {
    context.problem(
      popup,
      "owns no menuitem; a menu's items have role menuitem (APG menu)."
    )
  }
  for (const item of items) {
    const role = roleOf(item)
    const states =
      role === "menuitemcheckbox"
        ? ["true", "false", "mixed"]
        : ["true", "false"]
    if (
      role !== "menuitem" &&
      !states.includes(item.getAttribute("aria-checked") ?? "")
    ) {
      context.problem(
        item,
        `has no aria-checked; a ${role} says whether it's checked (APG menu).`
      )
    }
  }
  const composite: Composite = {
    container: popup,
    items: () => ownItems(popup),
    noun: "item",
    source: "menu",
  }
  // Tab leaves a menu, so its items need no tab stop, but never more than one.
  checkTabStop(context, composite, false)
  const active = context.doc.activeElement
  if (
    !popup.contains(active) &&
    !active?.hasAttribute("aria-activedescendant")
  ) {
    context.problem(
      popup,
      `is open, but focus is on ${describe(active)}; opening a menu moves focus into it (APG menu button).`
    )
    return
  }
  if (!items.length) {
    return
  }
  const arrows = arrowsFor(orientationOf(context, popup), isRtl(popup))
  const start =
    currentItem(context, composite) ??
    (await expectStep(context, composite, arrows.next, true, undefined))
  await checkNavigation(context, composite, {
    next: [arrows.next],
    previous: [arrows.previous],
    homeEnd: true,
  })
  await checkTypeahead(context, composite, arrows)
  await returnTo(context, composite, start, arrows)
  if (
    !(await checkEscape(context, popup, trigger, "menu button")) ||
    !trigger
  ) {
    return
  }
  if (trigger.getAttribute("aria-expanded") === "true") {
    context.problem(
      trigger,
      `still has aria-expanded="true" after its menu closed (APG menu button).`
    )
  }
  const reopened = await reopen(
    context,
    trigger,
    "Enter",
    ["menu"],
    "menu button"
  )
  if (reopened) {
    await checkEnterActivates(context, reopened, trigger)
  }
}

// Enter on a plain item activates it, which runs its action, and closes the
// menu with focus back on the button. The menu opens again after.
async function checkEnterActivates(
  context: PatternContext,
  popup: Element,
  trigger: Element
) {
  const composite: Composite = {
    container: popup,
    items: () => ownItems(popup),
    noun: "item",
    source: "menu",
  }
  const item = composite
    .items()
    .find(
      (el) =>
        roleOf(el) === "menuitem" &&
        !el.hasAttribute("aria-haspopup") &&
        !isDisabledElement(el)
    )
  if (!item) {
    return
  }
  await returnTo(context, composite, item, {
    next: "ArrowDown",
    previous: "ArrowUp",
  })
  if (currentItem(context, composite) !== item) {
    return
  }
  await context.press("Enter")
  if (isShown(popup)) {
    context.problem(
      item,
      "Enter should activate the item and close the menu (APG menu)."
    )
    return
  }
  if (context.doc.activeElement !== trigger) {
    context.problem(
      trigger,
      `focus should return here when an item's Enter closes the menu, but went to ${describe(context.doc.activeElement)} (APG menu button).`
    )
  } else {
    await reopen(context, trigger, "Enter", ["menu"], "menu button")
  }
}

// jsdom keeps `inert` as a property and never writes the attribute.
function isInert(el: Element) {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if ((node as HTMLElement).inert === true || node.hasAttribute("inert")) {
      return true
    }
  }
  return false
}

// The page, or a part of it: inert, or something to read or use, unlike a
// backdrop or a focus guard.
const isPage = (el: Element) =>
  !el.matches("script, style, template") &&
  (isInert(el) || !!el.textContent?.trim() || tabStops(el).length > 0)

// A modal dialog makes the page behind it inert: its trigger, or without one,
// all the content beside it, or beside the nearest element around it that has
// content beside it, like the page beside a dialog's container.
function isPageInert(popup: Element) {
  const trigger = triggerOf(popup)
  if (trigger) {
    return isInert(trigger)
  }
  for (let node = popup; node.parentElement; node = node.parentElement) {
    const page = [...node.parentElement.children].filter(
      (el) => el !== node && isPage(el)
    )
    if (page.length) {
      return page.every((el) => isInert(el))
    }
  }
  return false
}

/**
 * Dialog and alert dialog: a name, focus inside, and Escape. A modal one, one
 * that makes the page behind it inert, also keeps Tab inside and needs
 * `aria-modal="true"`, which goes past the APG's letter: its dialog pattern is
 * modal, and says so only in prose. One that only keeps Tab inside leaves the
 * page usable, so it has no `aria-modal`. A non-modal one, like a popover with
 * role dialog, lets Tab move on.
 */
async function modal(context: PatternContext, role: "dialog" | "alertdialog") {
  const source = role === "dialog" ? "dialog (modal)" : "alert dialog"
  const popup = findWidget(context, [role])
  if (!popup || !isShown(popup)) {
    context.problem(
      context.root,
      `has no open ${role}; open it before checking the ${source} pattern.`
    )
    return
  }
  context.watch(popup)
  requireName(context, popup, source)
  if (role === "alertdialog" && !ids(popup, "aria-describedby").length) {
    context.problem(
      popup,
      "has no aria-describedby; an alert dialog points it at its message (APG alert dialog)."
    )
  }
  const inside = () => popup.contains(context.doc.activeElement)
  if (!inside()) {
    context.problem(
      popup,
      `is open, but focus is on ${describe(context.doc.activeElement)}; opening a dialog moves focus into it (APG ${source}).`
    )
    return
  }
  // A modal dialog keeps Tab and Shift+Tab inside, past the last stop and the
  // first; a non-modal one lets Tab move on, and focus comes back for Escape.
  const first = context.doc.activeElement as HTMLElement | null
  const pageInert = isPageInert(popup)
  const stops = tabStops(popup).length
  let trapped = true
  for (const key of ["Tab", "Shift+Tab"]) {
    const from = context.doc.activeElement
    let moved = false
    for (let press = 0; press <= stops && trapped; press++) {
      await context.press(key)
      if (!inside()) {
        trapped = false
      }
      if (context.doc.activeElement !== from) {
        moved = true
      }
    }
    if (trapped && !moved && stops > 1) {
      context.problem(
        popup,
        `${key} keeps focus on ${describe(from)}; it moves through the dialog's ${stops} tab stops, wrapping at the ends (APG ${source}).`
      )
    }
  }
  const modal = pageInert || popup.getAttribute("aria-modal") === "true"
  if (modal && !trapped) {
    context.problem(
      popup,
      `is modal, but Tab moved focus out of it, to ${describe(context.doc.activeElement)}; it wraps inside (APG ${source}).`
    )
  }
  if (
    modal &&
    popup.getAttribute("aria-modal") !== "true" &&
    !(popup instanceof HTMLDialogElement)
  ) {
    context.problem(
      popup,
      `is modal but has no aria-modal="true", which tells screen readers the page behind it is inert (APG ${source}).`
    )
  }
  if (!inside()) {
    first?.focus()
  }
  const trigger = triggerOf(popup)
  if ((await checkEscape(context, popup, trigger, source)) && trigger) {
    await reopen(context, trigger, "Enter", [role], source)
  }
}

const dialog = (context: PatternContext) => modal(context, "dialog")
const alertdialog = (context: PatternContext) => modal(context, "alertdialog")

/** Combobox: a name and aria-expanded, Down opening its popup, Down and Up moving the active option, and Escape. */
async function combobox(context: PatternContext) {
  const box = findWidget(context, ["combobox"])
  if (!box) {
    context.problem(
      context.root,
      "has no element with role combobox, so it isn't a combobox."
    )
    return
  }
  requireName(context, box, "combobox")
  const expanded = () => box.getAttribute("aria-expanded") === "true"
  if (!["true", "false"].includes(box.getAttribute("aria-expanded") ?? "")) {
    context.problem(
      box,
      `has no aria-expanded; a combobox says whether its popup is open, "true" or "false" (APG combobox).`
    )
  }
  if (!tabStops(box).includes(box)) {
    context.problem(
      box,
      "isn't a tab stop; a combobox takes Tab (APG combobox)."
    )
  }
  const wasOpen = expanded()
  await context.focus(box)
  if (!expanded()) {
    await context.press("ArrowDown")
  }
  if (!expanded()) {
    context.problem(
      box,
      'ArrowDown should open its popup, with aria-expanded="true" (APG combobox).'
    )
    return
  }
  const popup = popupOf(box, ["listbox", "grid", "tree", "dialog"])
  if (!popup || !isShown(popup)) {
    context.problem(
      box,
      "is expanded, but its aria-controls names no open listbox, grid, tree or dialog (APG combobox)."
    )
    return
  }
  context.watch(popup)
  const kind = roleOf(popup)
  // A combobox's popup is a listbox unless aria-haspopup says otherwise (ARIA: combobox).
  if (kind !== "listbox" && box.getAttribute("aria-haspopup") !== kind) {
    context.problem(
      box,
      `controls a ${kind}, so it has aria-haspopup="${kind}"; only a listbox popup goes without it (APG combobox).`
    )
  }
  if (kind === "listbox") {
    await checkActiveOption(context, box, popup)
  }
  await context.press("Escape")
  if (expanded()) {
    context.problem(box, "Escape should close its popup (APG combobox).")
  }
  if (context.doc.activeElement !== box) {
    context.problem(
      box,
      `focus stays here when Escape closes the popup, but went to ${describe(context.doc.activeElement)} (APG combobox).`
    )
  }
  if (wasOpen && !expanded()) {
    await context.press("ArrowDown")
  }
}

// With a listbox popup, DOM focus stays on the combobox while Down and Up move
// the active option, which aria-activedescendant names.
async function checkActiveOption(
  context: PatternContext,
  box: Element,
  popup: Element
) {
  const composite: Composite = {
    container: popup,
    items: () => withRole(popup, ["option"]),
    noun: "option",
    source: "combobox",
  }
  if (!composite.items().length) {
    return
  }
  const stays = (key: string) => {
    if (context.doc.activeElement !== box) {
      context.problem(
        box,
        `${key} moved DOM focus to ${describe(context.doc.activeElement)}; it stays on the combobox, with aria-activedescendant naming the option (APG combobox).`
      )
    }
    return context.doc.activeElement === box
  }
  if (!currentItem(context, composite)) {
    await context.press("ArrowDown")
    if (!stays("ArrowDown")) {
      return
    }
  }
  if (!currentItem(context, composite)) {
    context.problem(
      box,
      "ArrowDown should make an option active, with aria-activedescendant (APG combobox)."
    )
    return
  }
  await expectStep(context, composite, "ArrowDown", true, undefined)
  if (!stays("ArrowDown")) {
    return
  }
  await expectStep(context, composite, "ArrowUp", false, undefined)
  stays("ArrowUp")
}

export { alertdialog, combobox, dialog, menu }
