import { field, fieldGroup, fieldSet } from "@ui-sdk/core/field"
import {
  checkFieldOutside,
  fieldOutsideAttrs,
  fieldOutsideErrorShown,
  type FieldOutsideSlot,
} from "@ui-sdk/core/renderer"
import { createParts } from "./define-element"

const owner = "ui-field"

// A part outside any field is plain, with the same attributes the other
// adapters write, so styles that select it, and the rule that keeps a hidden
// part hidden, still match.
function writeAlone(el: HTMLElement, slot: FieldOutsideSlot) {
  for (const [name, value] of Object.entries(fieldOutsideAttrs(slot))) {
    if (el.getAttribute(name) !== value) {
      el.setAttribute(name, value)
    }
  }
}

// A label outside any field names its control only as a native <label>. With
// as-child, its child may come later, and the label runs this again then.
function labelAlone(el: HTMLElement, host: HTMLElement) {
  writeAlone(el, "label")
  if (el === host && host.hasAttribute("as-child")) {
    return
  }
  checkFieldOutside(
    el,
    "label",
    "Put `as-child` on the <ui-field-label>, around a native <label> that wraps the control."
  )
}

// An error outside any field has no validation behind it, so only a `match`
// that is present or "true" shows it. With as-child, its child may come later,
// and the error runs this again then.
function errorAlone(el: HTMLElement, host: HTMLElement) {
  if (el === host && host.hasAttribute("as-child")) {
    return
  }
  writeAlone(el, "error")
  const match = host.getAttribute("match")
  el.hidden = !fieldOutsideErrorShown({
    match: match === "" || match === "true",
  })
}

// <ui-field> ties the control inside it to its label and messages. The control
// can be any form control: a native input, or <ui-checkbox> and the others.
// Markup:
//
// <ui-field>
//   <ui-field-label>Email</ui-field-label>
//   <input type="email" name="email" required />
//   <ui-field-description>We never share it.</ui-field-description>
//   <ui-field-error></ui-field-error>
// </ui-field>
//
// An empty <ui-field-error> shows the browser's message for the current
// problem. Set `invalid` when your code decides instead, as an attribute or
// a property: `true` shows the field invalid, `false` shows no errors whatever
// the browser thinks, and `undefined` hands it back to the browser.
//
// <ui-field-set> wraps a native <fieldset> and its <legend>, so `disabled`
// disables every control inside it the way the browser does. A
// <ui-field-description> right inside it, outside any field, describes the
// group. <ui-field-group> lays fields out. Markup:
//
// <ui-field-set disabled>
//   <fieldset>
//     <legend>Shipping address</legend>
//     <ui-field-description>Where we send your order.</ui-field-description>
//     <ui-field-group>
//       <ui-field>…</ui-field>
//     </ui-field-group>
//   </fieldset>
// </ui-field-set>
//
// A legend that isn't a native <legend> is a <ui-field-legend>.
function defineFieldElements() {
  createParts(field, {
    root: {
      tag: owner,
      display: "block",
      // `invalid` is three-way, so its property writes "false" for false, and
      // reads undefined without the attribute, which leaves it to the browser.
      kinds: { invalid: (value) => value !== "false" },
      // Empty errors show the current message.
      render(el, instance) {
        const update = () => {
          for (const error of Array.from(
            el.querySelectorAll<HTMLElement>("ui-field-error")
          )) {
            if (error.closest(owner) !== el) {
              continue
            }
            if (!("message" in error.dataset) && error.childNodes.length) {
              continue
            }
            error.dataset.message = ""
            const message = instance.api.internal.message()
            if (error.textContent !== message) {
              error.textContent = message
            }
          }
        }
        queueMicrotask(update)
        return instance.subscribe(update)
      },
    },
    // Outside any field, a label is plain. With as-child on a native <label>,
    // it labels the control inside it, like a card around a whole field.
    label: { tag: "ui-field-label", display: "block", alone: labelAlone },
    // Describes the nearest field, or the whole field set when no field is closer.
    description: {
      tag: "ui-field-description",
      owners: ["ui-field-set"],
      display: "block",
      alone: (el) => writeAlone(el, "description"),
    },
    error: { tag: "ui-field-error", display: "block", alone: errorAlone },
  })
  createParts(fieldSet, {
    // Wraps a native <fieldset> and its <legend>, so `disabled` disables every
    // control inside it the way the browser does.
    root: {
      tag: "ui-field-set",
      display: "contents",
      children: {
        set: (el) => el.querySelector(":scope > fieldset"),
        legend: (el) => el.querySelector(":scope > fieldset > legend"),
      },
      optionalChildren: ["legend"],
    },
    legend: { tag: "ui-field-legend", display: "block" },
  })
  createParts(fieldGroup, {
    root: { tag: "ui-field-group", self: "group", display: "block" },
  })
}

export { defineFieldElements }
