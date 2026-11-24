import type { PrimitiveInstance } from "@ui-sdk/core"
import {
  calendar,
  type CalendarApi,
  type CalendarDayState,
  type CalendarGridCell,
  type CalendarGridState,
  type CalendarHeadingState,
  type CalendarSelectState,
  type CalendarValue,
  type CalendarWeekdayState,
  type ISOMonth,
} from "@ui-sdk/core/calendar"
import { partState } from "@ui-sdk/core/renderer"
import type { datePicker } from "@ui-sdk/core/date-picker"
import {
  claimTag,
  definePart,
  createParts,
  findOwner,
  instanceOf,
  ownButton,
  parseAttribute,
  setDisplay,
} from "./define-element"
import { element } from "./list"

// What calendar parts belong to: a calendar, or a date picker, whose content
// holds the same parts.
const owner = "ui-calendar, ui-date-picker"

// The live `value` and `month` properties.
const calendarLiveState = {
  value: {
    get: (api: CalendarApi) => api.getValue(),
    set: (api: CalendarApi, value: CalendarValue) => api.setValue(value),
  },
  month: {
    get: (api: CalendarApi) => api.getMonth(),
    set: (api: CalendarApi, month: ISOMonth) => api.setMonth(month),
  },
}

// <ui-calendar> shows months of days with one tab stop. Callbacks fire
// `valuechange` and `monthchange`, and `value` and `month` are live
// properties. Left empty, it renders Previous, the heading and Next, and a
// grid for each month. Custom elements can't make a <table>, so the parts
// carry the table's roles and display instead. Markup:
//
// <ui-calendar mode="range" months="2">
//   <div>
//     <ui-calendar-previous><button>‹</button></ui-calendar-previous>
//     <ui-calendar-heading></ui-calendar-heading>
//     <ui-calendar-next><button>›</button></ui-calendar-next>
//   </div>
//   <ui-calendar-grid offset="0"></ui-calendar-grid>
//   <ui-calendar-grid offset="1"></ui-calendar-grid>
// </ui-calendar>
//
// <ui-calendar-month-select> and <ui-calendar-year-select> wrap a <select>,
// or make one, and fill it with the months or years unless it has options:
//
// <ui-calendar-month-select><select class="select"></select></ui-calendar-month-select>
// <ui-calendar-year-select></ui-calendar-year-select>
//
// A grid left empty renders its weekdays and weeks. Write them yourself to
// style their cells: a <template> in each holds the part every column or day
// copies, and an empty copy shows its label.
//
// <ui-calendar-grid offset="0">
//   <ui-calendar-weekdays><template><ui-calendar-weekday class="weekday"></ui-calendar-weekday></template></ui-calendar-weekdays>
//   <ui-calendar-weeks><template><ui-calendar-day class="day"></ui-calendar-day></template></ui-calendar-weeks>
// </ui-calendar-grid>
function defineCalendarElements() {
  createParts(calendar, {
    root: {
      tag: "ui-calendar",
      display: "block",
      defaults: { showOutsideDays: true },
      // `unavailable` as a property takes any matcher, like `{ weekday: [0, 6] }`.
      properties: ["unavailable"],
      state: calendarLiveState,
      api: [
        "getValue",
        "setValue",
        "getMonth",
        "setMonth",
        "previous",
        "next",
        "focus",
      ],
      render(el, instance) {
        if (!checkedForContent.has(el)) {
          checkedForContent.add(el)
          if (!el.firstElementChild) {
            renderDefaultCalendar(el, el)
          }
        }
        return renderCalendarParts(el, instance)
      },
    },
  })
  defineCalendarParts(calendar, "ui-date-picker")
}

/**
 * Defines the calendar's parts, which work inside <ui-calendar> and inside
 * <ui-date-picker-content>: with the calendar's primitive and the date
 * picker as `also`, or the other way around, since both have these slots.
 * Whichever runs first defines them.
 */
function defineCalendarParts(
  primitive: typeof calendar | typeof datePicker,
  also: string
) {
  const owners = [also]
  definePart(primitive, "heading", {
    tag: "ui-calendar-heading",
    owners,
    display: "block",
    render(el) {
      // It's the h2 the other adapters render, unless the author says otherwise.
      if (!el.hasAttribute("role")) {
        el.setAttribute("role", "heading")
      }
      if (!el.hasAttribute("aria-level")) {
        el.setAttribute("aria-level", "2")
      }
      scheduleRefresh(el)
    },
  })
  definePart(primitive, "previous", {
    tag: "ui-calendar-previous",
    owners,
    display: "contents",
    target: stepButton("‹"),
  })
  definePart(primitive, "next", {
    tag: "ui-calendar-next",
    owners,
    display: "contents",
    target: stepButton("›"),
  })
  for (const [tag, slot] of selectParts) {
    definePart(primitive, slot, {
      tag,
      owners,
      display: "contents",
      target: ownSelect,
      render: scheduleRefresh,
    })
  }
  definePart(primitive, "grid", {
    tag: "ui-calendar-grid",
    owners,
    display: "table",
    context: (el) => ({ id: String(gridOffset(el)) }),
    render(el) {
      if (!el.firstElementChild) {
        el.append(element("ui-calendar-weekdays"), element("ui-calendar-weeks"))
      }
    },
    changed(el) {
      for (const part of el.querySelectorAll<HTMLElement>(
        "ui-calendar-weekdays, ui-calendar-weeks"
      )) {
        scheduleRefresh(part)
      }
    },
  })
  // The weekdays are a row group, like a <thead>, around the header row
  // that fills the slot.
  definePart(primitive, "weekdays", {
    tag: "ui-calendar-weekdays",
    owners,
    display: "table-header-group",
    target: weekdaysRow,
    context: (el) => ({ id: String(gridOffset(el)) }),
    render(el) {
      el.setAttribute("role", "rowgroup")
      scheduleRefresh(el)
    },
  })
  definePart(primitive, "weekday", {
    tag: "ui-calendar-weekday",
    owners,
    display: "table-cell",
    context: (el) => ({ id: `${gridOffset(el)}-${el.getAttribute("index")}` }),
  })
  defineWeeksElement()
  definePart(primitive, "week", {
    tag: "ui-calendar-week",
    owners,
    display: "table-row",
  })
  definePart(primitive, "day", {
    tag: "ui-calendar-day",
    owners,
    display: "table-cell",
    context: (el) => ({ offset: gridOffset(el) }),
  })
}

// <ui-calendar-weeks> is a row group, like a <tbody>, of rows the calendar
// renders. The core has no slot for it, so it's a plain element. The header
// row and the empty cells the calendar renders get their display here too.
function defineWeeksElement() {
  if (!claimTag("ui-calendar-weeks")) {
    return
  }
  setDisplay("ui-calendar-weeks", "table-row-group")
  setDisplay("ui-calendar-weekdays > :not(template)", "table-row")
  setDisplay("ui-calendar-week > [role=gridcell]", "table-cell")
  customElements.define(
    "ui-calendar-weeks",
    class extends HTMLElement {
      connectedCallback() {
        this.setAttribute("role", "rowgroup")
        scheduleRefresh(this)
      }
    }
  )
}

const checkedForContent = new WeakSet<Element>()

// What each calendar or date picker left empty renders its grids into: the
// calendar, or the date picker's content.
const defaultContainers = new WeakMap<Element, Element>()

// The heading, weekdays and weeks of each calendar or date picker, which
// render from its state. A date picker's content may have moved to a portal,
// out of its subtree, so they're kept here rather than queried.
const stateParts = new WeakMap<Element, Set<HTMLElement>>()

// The grid state each weekdays or weeks part last rendered.
const renderedGrids = new WeakMap<Element, CalendarGridState>()

// What each generated row or cell shows: a week's first date, or a cell's date.
const renderedKeys = new WeakMap<Element, string>()

/**
 * Fills `container` with Previous, the heading and Next, and keeps a grid in
 * it for each month `calendar` shows, like a calendar or a date picker's
 * content left empty.
 */
function renderDefaultCalendar(container: HTMLElement, calendar: HTMLElement) {
  defaultContainers.set(calendar, container)
  const header = element("div")
  header.append(
    element("ui-calendar-previous"),
    element("ui-calendar-heading"),
    element("ui-calendar-next")
  )
  container.append(header)
}

/**
 * Renders the parts of a calendar or a date picker from its state, now and on
 * every change. Returns the unsubscribe, for the owner's `render` to return.
 */
function renderCalendarParts(
  calendar: HTMLElement,
  instance: PrimitiveInstance
) {
  const update = () => refresh(calendar)
  update()
  return instance.subscribe(update)
}

// The button a step wraps. A step written without one gets one, holding what
// the step held, or an arrow.
const stepButton = (arrow: string) =>
  ownButton((button) => (button.textContent = arrow))

// The header row inside <ui-calendar-weekdays>, made when the author wrote none.
function weekdaysRow(el: HTMLElement) {
  const written = el.querySelector<HTMLElement>(":scope > :not(template)")
  if (written) {
    return written
  }
  const row = element("div")
  el.append(row)
  return row
}

// The month and year selects, by tag.
const selectParts = [
  ["ui-calendar-month-select", "month-select"],
  ["ui-calendar-year-select", "year-select"],
] as const

// The <select> a month or year select wraps: the one written inside it, else
// a new one holding what the part held, like its options.
function ownSelect(el: HTMLElement) {
  const written = el.querySelector<HTMLSelectElement>(":scope > select")
  if (written) {
    return written
  }
  const select = element("select")
  select.append(...el.childNodes)
  el.append(select)
  return select
}

const gridOffset = (el: Element) => {
  const offset = parseAttribute(
    "number",
    el.closest("ui-calendar-grid")?.getAttribute("offset") ?? null
  )
  return typeof offset === "number" ? offset : 0
}

// Parts left empty show a label from state, which the calendar keeps current.
// Text the author wrote stays.
const ownText = new WeakSet<Element>()
function writeLabel(el: Element, label: () => string) {
  if (!ownText.has(el)) {
    if (el.firstElementChild || el.textContent?.trim()) {
      return
    }
    ownText.add(el)
  }
  const text = label()
  if (el.textContent !== text) {
    el.textContent = text
  }
}

// A part for a column or a day: a copy of the part in the container's
// <template>, for its classes and content, or a plain one.
function templatedPart(
  container: Element,
  tagName: string,
  attributes: Record<string, string>
) {
  const template =
    container.querySelector<HTMLTemplateElement>(":scope > template")?.content
      .firstElementChild
  const part =
    template?.localName === tagName
      ? (template.cloneNode(true) as HTMLElement)
      : element(tagName)
  for (const [name, value] of Object.entries(attributes)) {
    part.setAttribute(name, value)
  }
  return part
}

// Puts `el` after `previous`, or first, unless it's there already: moving a
// focused day would blur it.
function place(parent: Element, el: Element, previous: Element | null) {
  const current = previous
    ? previous.nextElementSibling
    : parent.firstElementChild
  if (current === el) {
    return
  }
  if (previous) {
    previous.after(el)
  } else {
    parent.prepend(el)
  }
}

// Parts that render from state, after their calendar's next change or once
// they connect, whichever comes first.
const scheduled = new WeakSet<Element>()
function scheduleRefresh(part: HTMLElement) {
  const calendar = findOwner(part, owner)
  if (!calendar) {
    return
  }
  let parts = stateParts.get(calendar)
  if (!parts) {
    stateParts.set(calendar, (parts = new Set()))
  }
  parts.add(part)
  if (scheduled.has(calendar)) {
    return
  }
  scheduled.add(calendar)
  queueMicrotask(() => {
    scheduled.delete(calendar)
    refresh(calendar)
  })
}

function refresh(calendar: HTMLElement) {
  const instance = instanceOf(calendar)
  if (!instance) {
    return
  }
  matchMonths(calendar)
  const parts = stateParts.get(calendar)
  if (!parts) {
    return
  }
  for (const el of parts) {
    // A part that left, or moved to another calendar, renders there.
    if (!el.isConnected || findOwner(el, owner) !== calendar) {
      parts.delete(el)
      continue
    }
    if (el.localName === "ui-calendar-heading") {
      writeLabel(
        el,
        () =>
          (partState(instance.part("heading")) as CalendarHeadingState).label
      )
      continue
    }
    const select = selectParts.find(([tagName]) => tagName === el.localName)
    if (select) {
      renderOptions(el, instance, select[1])
      continue
    }
    const offset = gridOffset(el)
    const grid = partState(
      instance.part("grid", { offset, id: String(offset) })
    ) as CalendarGridState
    if (el.localName === "ui-calendar-weeks") {
      renderWeeks(el, instance, offset, grid)
    } else {
      renderWeekdays(el, calendar, instance, offset, grid)
    }
  }
}

// A select with no options of its own gets the months or years, again when
// they change, like the years around the one shown. Options the author wrote stay.
const ownOptions = new WeakSet<Element>()
const renderedOptions = new WeakMap<Element, CalendarSelectState>()
function renderOptions(
  el: HTMLElement,
  instance: PrimitiveInstance,
  slot: "month-select" | "year-select"
) {
  const select = el.querySelector<HTMLSelectElement>(":scope > select")
  const state = partState(instance.part(slot)) as CalendarSelectState
  if (!select || renderedOptions.get(select) === state) {
    return
  }
  renderedOptions.set(select, state)
  if (!ownOptions.has(select)) {
    if (select.options.length) {
      return
    }
    ownOptions.add(select)
  }
  select.replaceChildren(
    ...state.options.map((option) =>
      element(
        "option",
        { value: String(option.value), disabled: option.disabled },
        option.label
      )
    )
  )
  // The core wrote the selected option before this one existed.
  select.value = String(state.value)
}

// A calendar left empty shows a grid for each month.
function matchMonths(calendar: HTMLElement) {
  const container = defaultContainers.get(calendar)
  if (!container) {
    return
  }
  const months = parseAttribute("number", calendar.getAttribute("months")) as
    number | undefined
  const count = Number.isFinite(months) ? Math.max(1, Math.floor(months!)) : 1
  const grids = container.querySelectorAll(":scope > ui-calendar-grid")
  for (let offset = grids.length; offset < count; offset++) {
    container.append(element("ui-calendar-grid", { offset: String(offset) }))
  }
  for (let offset = count; offset < grids.length; offset++) {
    grids[offset]!.remove()
  }
}

// Seven column headers, labeled again when the grid or the weekday format changes.
const renderedFormats = new WeakMap<Element, string | null>()
function renderWeekdays(
  weekdays: HTMLElement,
  calendar: HTMLElement,
  instance: PrimitiveInstance,
  offset: number,
  grid: CalendarGridState
) {
  // The row comes with the element's upgrade, which may not have happened yet.
  const row = weekdays.querySelector(":scope > :not(template)")
  const format = calendar.getAttribute("weekday-format")
  if (
    !row ||
    (renderedGrids.get(weekdays) === grid &&
      renderedFormats.get(weekdays) === format)
  ) {
    return
  }
  renderedGrids.set(weekdays, grid)
  renderedFormats.set(weekdays, format)
  if (!row.firstElementChild) {
    row.append(
      ...grid.weekdays.map((_, index) =>
        templatedPart(weekdays, "ui-calendar-weekday", { index: String(index) })
      )
    )
  }
  for (const weekday of row.querySelectorAll(":scope > ui-calendar-weekday")) {
    const index = Number(weekday.getAttribute("index"))
    writeLabel(
      weekday,
      () =>
        (
          partState(
            instance.part("weekday", { index, id: `${offset}-${index}` })
          ) as CalendarWeekdayState
        ).label
    )
  }
}

// A row for each week, keyed by its first date, with a day in each cell,
// keyed by its date. Rows and days already in place stay put.
function renderWeeks(
  weeks: HTMLElement,
  instance: PrimitiveInstance,
  offset: number,
  grid: CalendarGridState
) {
  if (renderedGrids.get(weeks) === grid) {
    return
  }
  renderedGrids.set(weeks, grid)
  const rows = new Map<string, Element>()
  const cells = new Map<string, Element>()
  for (const row of weeks.children) {
    const key = renderedKeys.get(row)
    if (key === undefined) {
      continue
    }
    rows.set(key, row)
    for (const cell of row.children) {
      const cellKey = renderedKeys.get(cell)
      if (cellKey !== undefined) {
        cells.set(cellKey, cell)
      }
    }
  }
  let previousRow: Element | null = weeks.querySelector(":scope > template")
  for (const week of grid.weeks) {
    const rowKey = week[0]!.date
    const row = rows.get(rowKey) ?? element("ui-calendar-week")
    rows.delete(rowKey)
    renderedKeys.set(row, rowKey)
    place(weeks, row, previousRow)
    previousRow = row
    let previousCell: Element | null = null
    for (const cell of week) {
      // A cell that shows nothing stays an empty cell, so the columns line up.
      const cellKey = cell.hidden ? `hidden ${cell.date}` : cell.date
      const el = cells.get(cellKey) ?? createCell(weeks, cell)
      cells.delete(cellKey)
      renderedKeys.set(el, cellKey)
      place(row, el, previousCell)
      previousCell = el
      if (!cell.hidden) {
        writeLabel(el, () => dayLabel(instance, cell.date, offset))
      }
    }
  }
  for (const cell of cells.values()) {
    cell.remove()
  }
  for (const row of rows.values()) {
    row.remove()
  }
}

function createCell(weeks: Element, cell: CalendarGridCell) {
  if (cell.hidden) {
    return element("span", { role: "gridcell" })
  }
  return templatedPart(weeks, "ui-calendar-day", { value: cell.date })
}

const dayLabel = (instance: PrimitiveInstance, value: string, offset: number) =>
  (partState(instance.part("day", { value, offset })) as CalendarDayState).label

export {
  defineCalendarElements,
  defineCalendarParts,
  renderCalendarParts,
  renderDefaultCalendar,
}
