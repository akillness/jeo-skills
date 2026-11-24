import type { PrimitiveInstance } from "@ui-sdk/core"
import { datePicker, type DatePickerHintState } from "@ui-sdk/core/date-picker"
import { partState } from "@ui-sdk/core/renderer"
import {
  defineCalendarParts,
  renderCalendarParts,
  renderDefaultCalendar,
} from "./calendar"
import {
  createParts,
  findOwner,
  ownButton,
  parseAttribute,
} from "./define-element"
import { showDefaultText } from "./default-text"
import { element } from "./list"
import { popupKinds, popupState, sheetPortal } from "./popup"

const owner = "ui-date-picker"

// <ui-date-picker> is form-associated: it submits the date as an ISO string
// under its name, or a range's ends under `start-name` and `end-name`, with no
// hidden input. Left empty, it renders an input, or two in range mode, the
// trigger and the popup with a calendar. Callbacks fire `valuechange`,
// `monthchange`, `openchange` and `dismissattempt`, and `value`, `month` and
// `open` are live properties. Markup:
//
// <ui-date-picker name="due">
//   <ui-date-picker-input><input aria-label="Due date" /></ui-date-picker-input>
//   <ui-date-picker-trigger></ui-date-picker-trigger>
//   <ui-date-picker-hint></ui-date-picker-hint>
//   <ui-date-picker-content>
//     <div>
//       <ui-calendar-previous></ui-calendar-previous>
//       <ui-calendar-heading></ui-calendar-heading>
//       <ui-calendar-next></ui-calendar-next>
//     </div>
//     <ui-calendar-grid></ui-calendar-grid>
//     <ui-date-picker-preset value="2026-12-25">Christmas</ui-date-picker-preset>
//   </ui-date-picker-content>
// </ui-date-picker>
//
// Every Calendar part works inside the content, which renders Previous, the
// heading, Next and a grid for each month when left empty. An input wraps
// your own <input>, or makes one; `end` makes it a range's end. The trigger,
// Clear and presets wrap a <button>, or make one around what they hold. An
// empty hint shows the format to type, like "MM/DD/YYYY".
function defineDatePickerElements() {
  createParts(datePicker, {
    root: {
      tag: owner,
      defaults: {
        showOutsideDays: true,
        closeOnSelect: true,
        dismissible: true,
      },
      display: "block",
      formAssociated: true,
      kinds: popupKinds,
      // `unavailable` as a property takes any matcher, like `{ weekday: [0, 6] }`.
      properties: ["unavailable"],
      // container="#id" is found in the page by the portal, never passed on as a
      // selector. A disabled <ui-field> around it disables all of it, as a
      // disabled Field does in the other frameworks.
      options: (el) => ({
        container: undefined,
        ...(el.closest("ui-field")?.hasAttribute("disabled") && {
          disabled: true,
        }),
      }),
      // The live `value` and `month` properties, as on a calendar.
      state: {
        value: {
          get: (api) => api.getValue(),
          set: (api, value) => api.setValue(value),
        },
        month: {
          get: (api) => api.getMonth(),
          set: (api, month) => api.setMonth(month),
        },
        ...popupState,
      },
      api: [
        "getValue",
        "setValue",
        "clear",
        "getMonth",
        "setMonth",
        "previous",
        "next",
        "focus",
        "isOpen",
        "setOpen",
        "open",
        "close",
        "toggle",
      ],
      // container="#id" renders the popup there, and a sheet's viewport with it.
      portal: sheetPortal("ui-date-picker-viewport"),
      render(picker, instance) {
        if (!checkedForContent.has(picker)) {
          checkedForContent.add(picker)
          if (!picker.firstElementChild) {
            renderDefaultContent(picker)
          }
        }
        const cleanups = [
          renderCalendarParts(picker, instance),
          showDefaultText(
            picker,
            instance,
            "ui-date-picker-hint",
            () =>
              (partState(instance.part("hint", {})) as DatePickerHintState)
                .placeholder
          ),
        ]
        if (hasDefaultContent.has(picker)) {
          const update = () => matchInputs(picker, instance)
          update()
          cleanups.push(instance.subscribe(update))
        }
        return () => cleanups.forEach((cleanup) => cleanup?.())
      },
    },
    input: {
      tag: "ui-date-picker-input",
      display: "contents",
      target: textInput,
      context: (el) => ({
        id: parseAttribute("boolean", el.getAttribute("end")) ? "end" : "start",
      }),
      // The input's binding reads which end it holds once.
      rebind: ["end"],
    },
    trigger: {
      tag: "ui-date-picker-trigger",
      display: "contents",
      target: ownButton((button) => (button.innerHTML = calendarIcon)),
    },
    content: {
      tag: "ui-date-picker-content",
      display: "block",
      kinds: popupKinds,
      render(el) {
        const picker = findOwner(el, owner)
        if (picker && !el.firstElementChild) {
          renderDefaultCalendar(el, picker)
        }
      },
    },
    hint: "ui-date-picker-hint",
    clear: {
      tag: "ui-date-picker-clear",
      display: "contents",
      target: ownButton(),
    },
    // `value` is a date, or a range's two dates separated by a comma.
    preset: {
      tag: "ui-date-picker-preset",
      display: "contents",
      target: ownButton(),
      context: (el) => ({ id: el.getAttribute("value") ?? "" }),
    },
  })
  defineCalendarParts(datePicker, "ui-calendar")
}

// The icon an empty trigger shows, as React's does.
const calendarIcon =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">' +
  '<rect x="2" y="3" width="12" height="11" rx="1.5" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" /></svg>'

const checkedForContent = new WeakSet<Element>()

// Date pickers left empty, which keep an input for each end in range mode.
const hasDefaultContent = new WeakSet<Element>()

// The mode each date picker left empty last rendered its inputs for.
const renderedModes = new WeakMap<Element, string>()

function renderDefaultContent(picker: HTMLElement) {
  hasDefaultContent.add(picker)
  picker.append(
    element("ui-date-picker-input"),
    element("ui-date-picker-trigger"),
    element("ui-date-picker-content")
  )
}

// The end input comes and goes with range mode, after the start input.
function matchInputs(picker: HTMLElement, instance: PrimitiveInstance) {
  // The mode is in state, which `get()` types loosely.
  const { mode } = instance.get() as { mode: string }
  if (renderedModes.get(picker) === mode) {
    return
  }
  renderedModes.set(picker, mode)
  const end = picker.querySelector(":scope > ui-date-picker-input[end]")
  if (mode !== "range") {
    return end?.remove()
  }
  if (!end) {
    picker
      .querySelector(":scope > ui-date-picker-input")
      ?.after(element("ui-date-picker-input", { end: true }))
  }
}

// The <input> an input part wraps, made when the author wrote none.
function textInput(el: HTMLElement) {
  const written = el.querySelector("input")
  if (written) {
    return written
  }
  const input = element("input")
  el.append(input)
  return input
}

export { defineDatePickerElements }
