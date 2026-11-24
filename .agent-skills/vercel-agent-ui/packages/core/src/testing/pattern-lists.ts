// The composite patterns whose items sit in one list: listbox, tabs, radio
// group, toolbar, menubar and tree view. Each checks its roles and states,
// then drives its keys from the tab stop and puts focus back where it was.
import {
  checkedOf,
  describe,
  focusables,
  hasBoolean,
  ids,
  isReadOnly,
  isRtl,
  isUnreachable,
  roleOf,
  tabStops,
  withRole,
} from "./aria"
import {
  checkNavigation,
  checkTabStop,
  checkTypeahead,
  currentItem,
  enter,
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
import { isDisabledElement } from "../foundation/forms/form"

const isSelected = (el: Element) =>
  el.getAttribute("aria-selected") === "true" ||
  el.getAttribute("aria-checked") === "true"

const isChecked = (el: Element) => checkedOf(el) === "true"

function missing(context: PatternContext, roles: string, pattern: string) {
  context.problem(
    context.root,
    `has no element with role ${roles}, so it isn't a ${pattern}.`
  )
}

/** Listbox: options with aria-selected, one tab stop, arrows, Home and End, selection and typeahead. */
async function listbox(context: PatternContext) {
  const box = findWidget(context, ["listbox"])
  if (!box) {
    return missing(context, "listbox", "listbox")
  }
  context.watch(box)
  requireName(context, box, "listbox")
  checkOwned(context, box, ["option"], "listbox")
  const multiple = box.getAttribute("aria-multiselectable") === "true"
  const options = withRole(box, ["option"])
  if (!options.length) {
    context.problem(
      box,
      "owns no option; a listbox's items have role option (APG listbox)."
    )
  }
  for (const option of options) {
    if (
      !option.hasAttribute("aria-selected") &&
      !(multiple && option.hasAttribute("aria-checked"))
    ) {
      context.problem(
        option,
        `has no aria-selected; a selectable option says whether it's selected, "true" or "false" (APG listbox).`
      )
    }
  }
  const selected = options.filter(isSelected)
  if (!multiple && selected.length > 1) {
    context.problem(
      box,
      `has ${selected.length} selected options without aria-multiselectable="true" (APG listbox).`
    )
  }
  const composite: Composite = {
    container: box,
    items: () => withRole(box, ["option"]),
    noun: "option",
    source: "listbox",
  }
  const arrows = arrowsFor(orientationOf(context, box), isRtl(box))
  // A combobox's popup is reached from the combobox, which is the tab stop,
  // and choosing an option there closes it.
  const owner = triggerOf(box)
  const popup = !!owner && roleOf(owner) === "combobox"
  checkTabStop(context, composite, !popup)
  if (options.length < 2) {
    return
  }
  await enter(context, composite)
  const start = await checkNavigation(context, composite, {
    next: [arrows.next],
    previous: [arrows.previous],
    homeEnd: true,
  })
  const readOnly =
    box.getAttribute("aria-readonly") === "true" || isDisabledElement(box)
  if (!readOnly && (multiple || !popup)) {
    await checkSpaceSelects(context, composite, arrows, multiple)
  }
  await checkTypeahead(context, composite, arrows)
  await returnTo(context, composite, start, arrows)
}

// Space selects the focused option, or toggles it in a multi-select listbox,
// when selection doesn't follow focus already. Puts the selection back after.
async function checkSpaceSelects(
  context: PatternContext,
  composite: Composite,
  arrows: { next: string; previous: string },
  multiple: boolean
) {
  const before = composite.items().filter(isSelected)
  let option = currentItem(context, composite)
  if (option && (isSelected(option) || isDisabledElement(option))) {
    await context.press(arrows.next)
    option = currentItem(context, composite)
  }
  if (!option || isSelected(option) || isDisabledElement(option)) {
    return
  }
  await context.press("Space")
  if (!isSelected(option)) {
    context.problem(
      option,
      `Space should select the focused option (APG listbox).`
    )
    return
  }
  if (multiple) {
    await context.press("Space")
  } else if (before[0]) {
    await returnTo(context, composite, before[0], arrows)
    if (!isSelected(before[0])) {
      await context.press("Space")
    }
  }
}

/** Tabs: tabs with aria-selected, linked to their panels, one tab stop, wrapping arrows and activation. */
async function tabs(context: PatternContext) {
  const list = findWidget(context, ["tablist"])
  if (!list) {
    return missing(context, "tablist", "tabs")
  }
  requireName(context, list, "tabs")
  checkOwned(context, list, ["tab"], "tabs")
  const all = withRole(list, ["tab"])
  if (!all.length) {
    context.problem(
      list,
      "owns no tab; a tablist's items have role tab (APG tabs)."
    )
  }
  for (const tab of all) {
    if (!hasBoolean(tab, "aria-selected")) {
      context.problem(
        tab,
        `has no aria-selected; the active tab has aria-selected="true" and the others "false" (APG tabs).`
      )
    }
  }
  const selected = all.filter(isSelected)
  if (selected.length > 1) {
    context.problem(
      list,
      `has ${selected.length} selected tabs; one tab is active (APG tabs).`
    )
  }
  checkPanels(context, all)
  const composite: Composite = {
    container: list,
    items: () => withRole(list, ["tab"]),
    noun: "tab",
    source: "tabs",
  }
  const arrows = arrowsFor(orientationOf(context, list), isRtl(list))
  checkTabStop(context, composite)
  const stop = tabStops(list)[0]
  if (
    stop &&
    selected[0] &&
    !isDisabledElement(selected[0]) &&
    stop !== selected[0]
  ) {
    context.problem(
      stop,
      `takes Tab, but the active tab, ${describe(selected[0])}, should (APG tabs).`
    )
  }
  if (all.length < 2) {
    return
  }
  const start = await enter(context, composite)
  await checkNavigation(context, composite, {
    next: [arrows.next],
    previous: [arrows.previous],
    wraps: true,
    homeEnd: true,
  })
  // Automatic tabs activate a tab when it takes focus; manual ones on Enter or Space.
  for (const key of ["Enter", "Space"]) {
    const tab = await expectStep(context, composite, arrows.next, true, true)
    if (isSelected(tab) || isDisabledElement(tab)) {
      continue
    }
    await context.press(key)
    if (!isSelected(tab)) {
      context.problem(tab, `${key} should activate the focused tab (APG tabs).`)
    }
    checkPanels(context, composite.items())
  }
  await returnTo(context, composite, start, arrows)
  if (start && !isSelected(start)) {
    await context.press("Enter")
  }
}

// The active tab names its tabpanel with aria-controls, and every panel a
// tab names is a tabpanel labelled by that tab.
function checkPanels(context: PatternContext, all: Element[]) {
  for (const tab of all) {
    const panels = ids(tab, "aria-controls")
      .map((id) => context.doc.getElementById(id))
      .filter((panel) => !!panel)
    if (isSelected(tab) && !panels.length) {
      context.problem(
        tab,
        "is active but names no tabpanel with aria-controls (APG tabs)."
      )
    }
    for (const panel of panels) {
      if (roleOf(panel) !== "tabpanel") {
        context.problem(
          tab,
          `aria-controls points at ${describe(panel)}, which isn't a tabpanel (APG tabs).`
        )
        continue
      }
      if (!tab.id || !ids(panel, "aria-labelledby").includes(tab.id)) {
        context.problem(
          panel,
          `is labelled by its tab, ${describe(tab)}, with aria-labelledby (APG tabs).`
        )
      }
    }
  }
}

/** Radio group: radios with aria-checked, one tab stop on the checked radio, arrows that move and check. */
async function radioGroup(context: PatternContext) {
  const group = findWidget(context, ["radiogroup"])
  if (!group) {
    return missing(context, "radiogroup", "radio group")
  }
  requireName(context, group, "radio group")
  checkOwned(context, group, ["radio"], "radio group")
  const radios = withRole(group, ["radio"])
  if (!radios.length) {
    context.problem(
      group,
      "owns no radio; a radiogroup's items have role radio (APG radio group)."
    )
  }
  for (const radio of radios) {
    if (
      !(radio instanceof HTMLInputElement) &&
      !hasBoolean(radio, "aria-checked")
    ) {
      context.problem(
        radio,
        `has no aria-checked; a radio says whether it's checked, "true" or "false" (APG radio group).`
      )
    }
  }
  const checked = radios.filter(isChecked)
  if (checked.length > 1) {
    context.problem(
      group,
      `has ${checked.length} checked radios; one is checked at most (APG radio group).`
    )
  }
  const composite: Composite = {
    container: group,
    items: () => withRole(group, ["radio"]),
    noun: "radio",
    source: "radio group",
  }
  checkTabStop(context, composite)
  const stop = tabStops(group)[0]
  if (
    stop &&
    checked[0] &&
    !isDisabledElement(checked[0]) &&
    stop !== checked[0]
  ) {
    context.problem(
      stop,
      `takes Tab, but the checked radio, ${describe(checked[0])}, should (APG radio group).`
    )
  }
  if (radios.length < 2) {
    return
  }
  const start = await enter(context, composite)
  // A read-only group moves focus and keeps the radio it has checked.
  const readOnly = isReadOnly(group)
  let held: Element | undefined = checked[0]
  const kept = (key: string, radio: Element) => {
    if (isChecked(radio) && radio !== checked[0]) {
      context.problem(
        radio,
        `${key} checked it, but the group's aria-readonly="true" says it can't change (ARIA: aria-readonly).`
      )
    } else if (held && !isChecked(held)) {
      context.problem(
        held,
        `${key} unchecked it, but the group's aria-readonly="true" says it can't change (ARIA: aria-readonly).`
      )
      held = undefined
    }
  }
  // Space checks a focused radio that isn't checked, which can't be undone.
  if (start && !isChecked(start) && !isDisabledElement(start)) {
    await context.press("Space")
    if (readOnly) {
      kept("Space", start)
    } else if (!isChecked(start)) {
      context.problem(
        start,
        "Space should check the focused radio (APG radio group)."
      )
    }
  }
  // Down and Right move forward, Up and Left back, with left and right swapped right to left.
  const rtl = isRtl(group)
  const [forward, back] = rtl
    ? ["ArrowLeft", "ArrowRight"]
    : ["ArrowRight", "ArrowLeft"]
  await checkNavigation(context, composite, {
    next: ["ArrowDown", forward],
    previous: ["ArrowUp", back],
    wraps: true,
    homeEnd: false,
    onMove: (key, radio) => {
      if (readOnly) {
        kept(key, radio)
      } else if (!isChecked(radio) && !isDisabledElement(radio)) {
        context.problem(
          radio,
          `${key} should check the radio it moves to (APG radio group).`
        )
      }
    },
  })
  await returnTo(context, composite, start, {
    next: "ArrowDown",
    previous: "ArrowUp",
  })
}

const isEditable = (el: Element) =>
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLInputElement &&
    !/^(button|checkbox|radio|submit|reset|range|color|file|image)$/.test(
      el.type
    )) ||
  (el as HTMLElement).isContentEditable

/** Toolbar: one tab stop, arrows along its orientation, Home and End. */
async function toolbar(context: PatternContext) {
  const bar = findWidget(context, ["toolbar"])
  if (!bar) {
    return missing(context, "toolbar", "toolbar")
  }
  // A toolbar needs a name when the page has more than one.
  if (withRole(context.doc.body, ["toolbar"]).length > 1) {
    requireName(context, bar, "toolbar")
  }
  const composite: Composite = {
    container: bar,
    items: () => focusables(bar).filter((el) => !isUnreachable(el)),
    noun: "control",
    source: "toolbar",
  }
  const arrows = arrowsFor(orientationOf(context, bar), isRtl(bar))
  checkTabStop(context, composite)
  const items = composite.items()
  // Arrows edit text in a text field, so the toolbar's own arrows can't be checked past one.
  if (items.length < 2 || items.some(isEditable)) {
    return
  }
  const start = await enter(context, composite)
  await checkNavigation(context, composite, {
    next: [arrows.next],
    previous: [arrows.previous],
    homeEnd: true,
  })
  await returnTo(context, composite, start, arrows)
}

const menuItemRoles = ["menuitem", "menuitemcheckbox", "menuitemradio"]

/** The items a menu or menubar owns, leaving out those of the menus inside it. */
const ownItems = (container: Element) =>
  withRole(container, menuItemRoles).filter(
    (item) =>
      item.parentElement?.closest('[role="menu"], [role="menubar"]') ===
      container
  )

/** Menubar: one tab stop, wrapping arrows, Home and End, and the arrow across it opening an item's menu. */
async function menubar(context: PatternContext) {
  const bar = findWidget(context, ["menubar"])
  if (!bar) {
    return missing(context, "menubar", "menubar")
  }
  checkOwned(context, bar, menuItemRoles, "menubar")
  const items = ownItems(bar)
  if (!items.length) {
    context.problem(
      bar,
      "owns no menuitem; a menubar's items have role menuitem (APG menubar)."
    )
  }
  for (const item of items) {
    if (
      item.hasAttribute("aria-haspopup") &&
      !hasBoolean(item, "aria-expanded")
    ) {
      context.problem(
        item,
        `opens a menu but has no aria-expanded, "true" or "false" (APG menubar).`
      )
    }
  }
  const composite: Composite = {
    container: bar,
    items: () => ownItems(bar),
    noun: "item",
    source: "menubar",
  }
  const orientation = orientationOf(context, bar)
  const arrows = arrowsFor(orientation, isRtl(bar))
  checkTabStop(context, composite)
  if (items.length < 2) {
    return
  }
  const start = await enter(context, composite)
  await checkNavigation(context, composite, {
    next: [arrows.next],
    previous: [arrows.previous],
    wraps: true,
    homeEnd: true,
  })
  const opener = composite
    .items()
    .find(
      (item) => item.hasAttribute("aria-haspopup") && !isDisabledElement(item)
    )
  if (opener) {
    await returnTo(context, composite, opener, arrows)
    // A vertical menubar swaps the arrows, so the one across it opens a menu (APG menubar, note 5).
    const opens =
      orientation === "vertical"
        ? arrowsFor("horizontal", isRtl(bar)).next
        : "ArrowDown"
    await checkSubmenu(context, opener, opens)
  }
  await returnTo(context, composite, start, arrows)
}

// The arrow across a menubar opens an item's menu with focus inside; Escape
// closes it with focus back on the item.
async function checkSubmenu(
  context: PatternContext,
  item: Element,
  key: string
) {
  if (context.doc.activeElement !== item) {
    return
  }
  await context.press(key)
  const menu = popupOf(item, ["menu"])
  if (
    !menu ||
    !isShown(menu) ||
    item.getAttribute("aria-expanded") !== "true"
  ) {
    context.problem(
      item,
      `${key} should open its menu, with aria-expanded="true" (APG menubar).`
    )
    return
  }
  context.watch(menu)
  if (!menu.contains(context.doc.activeElement)) {
    context.problem(
      menu,
      `opened, but focus stayed on ${describe(context.doc.activeElement)}; it moves into the menu (APG menubar).`
    )
  }
  await context.press("Escape")
  if (isShown(menu)) {
    context.problem(menu, "Escape should close it (APG menubar).")
  } else if (context.doc.activeElement !== item) {
    context.problem(
      item,
      `Escape closed its menu, but focus went to ${describe(context.doc.activeElement)}, not back to it (APG menubar).`
    )
  }
}

/** Tree view: treeitems with aria-expanded on branches, one tab stop, arrows, Home and End, branches and typeahead. */
async function tree(context: PatternContext) {
  const box = findWidget(context, ["tree"])
  if (!box) {
    return missing(context, "tree", "tree view")
  }
  requireName(context, box, "tree view")
  checkOwned(context, box, ["treeitem"], "tree view")
  const items = withRole(box, ["treeitem"], { displayed: false })
  if (!items.length) {
    context.problem(
      box,
      "owns no treeitem; a tree's items have role treeitem (APG tree view)."
    )
  }
  for (const item of items) {
    const group = withRole(item, ["group"], { displayed: false }).find(
      (el) => el.parentElement?.closest('[role="treeitem"]') === item
    )
    if (
      (group || item.hasAttribute("aria-owns")) &&
      !hasBoolean(item, "aria-expanded")
    ) {
      context.problem(
        item,
        `has child items but no aria-expanded, "true" or "false" (APG tree view).`
      )
    }
  }
  const composite: Composite = {
    container: box,
    items: () => withRole(box, ["treeitem"]),
    noun: "item",
    source: "tree view",
  }
  orientationOf(context, box)
  checkTabStop(context, composite)
  if (!items.length) {
    return
  }
  const start = await enter(context, composite)
  const arrows = { next: "ArrowDown", previous: "ArrowUp" }
  await checkNavigation(context, composite, {
    next: [arrows.next],
    previous: [arrows.previous],
    homeEnd: true,
  })
  await checkBranch(context, composite, isRtl(box))
  await checkTypeahead(context, composite, arrows)
  await returnTo(context, composite, start, arrows)
}

// On the first branch: Right expands it, Right again moves to its first
// child, Left moves back to it, and Left collapses it. Right to left swaps
// them. Leaves the branch as it was.
async function checkBranch(
  context: PatternContext,
  composite: Composite,
  rtl: boolean
) {
  const [open, close] = rtl
    ? ["ArrowLeft", "ArrowRight"]
    : ["ArrowRight", "ArrowLeft"]
  const branch = composite
    .items()
    .find(
      (item) => item.hasAttribute("aria-expanded") && !isDisabledElement(item)
    )
  if (!branch) {
    return
  }
  await returnTo(context, composite, branch, {
    next: "ArrowDown",
    previous: "ArrowUp",
  })
  if (currentItem(context, composite) !== branch) {
    return
  }
  const expanded = () => branch.getAttribute("aria-expanded") === "true"
  const wasExpanded = expanded()
  if (!wasExpanded) {
    await context.press(open)
    if (!expanded()) {
      context.problem(
        branch,
        `${open} should expand a closed branch (APG tree view).`
      )
    } else if (currentItem(context, composite) !== branch) {
      context.problem(
        branch,
        `${open} should expand the branch and keep focus on it (APG tree view).`
      )
    }
  }
  if (expanded()) {
    const all = composite.items()
    const next = all[all.indexOf(branch) + 1]
    const level = Number(branch.getAttribute("aria-level"))
    const isChild =
      !!next &&
      (branch.contains(next) ||
        (!!level && Number(next.getAttribute("aria-level")) === level + 1))
    if (isChild) {
      await context.press(open)
      if (currentItem(context, composite) !== next) {
        context.problem(
          branch,
          `${open} on an open branch should move focus to its first child, ${describe(next)} (APG tree view).`
        )
      } else {
        await context.press(close)
        if (currentItem(context, composite) !== branch) {
          context.problem(
            next,
            `${close} on a child should move focus to its parent, ${describe(branch)} (APG tree view).`
          )
        }
      }
    }
  }
  if (currentItem(context, composite) !== branch) {
    return
  }
  await context.press(close)
  if (expanded()) {
    context.problem(
      branch,
      `${close} should collapse an open branch (APG tree view).`
    )
  } else if (wasExpanded) {
    await context.press(open)
  }
}

export {
  listbox,
  menubar,
  menuItemRoles,
  ownItems,
  radioGroup,
  tabs,
  toolbar,
  tree,
}
