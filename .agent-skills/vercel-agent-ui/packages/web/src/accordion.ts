import { accordion, type AccordionApi } from "@ui-sdk/core/accordion"
import { createParts, wrappedButton } from "./define-element"

const heading = ":scope > :is(h1, h2, h3, h4, h5, h6)"

// <ui-accordion> and its parts. Markup:
//
// <ui-accordion default-value="shipping">
//   <ui-accordion-item value="shipping">
//     <ui-accordion-header>
//       <h3><ui-accordion-trigger><button>Shipping</button></ui-accordion-trigger></h3>
//     </ui-accordion-header>
//     <ui-accordion-panel>…</ui-accordion-panel>
//   </ui-accordion-item>
// </ui-accordion>
//
// `default-value` lists open items separated by commas. The live state is the
// `value` property, an array. Setting it commits without events, like a
// native input's `value`, and `api.setValue()` fires them like a press.
function defineAccordionElements() {
  createParts(accordion, {
    root: {
      tag: "ui-accordion",
      display: "block",
      defaults: { collapsible: true },
      state: {
        value: {
          get: (api: AccordionApi) => api.getValue(),
          set: (api: AccordionApi, value: string[]) =>
            api.setValue(value ?? []),
        },
      },
      api: [
        "getValue",
        "setValue",
        "isOpen",
        "open",
        "close",
        "toggle",
        "openAll",
        "closeAll",
        "focus",
      ],
    },
    // Fires `openchange` and `openchangecomplete` with the item's open state.
    item: { tag: "ui-accordion-item", display: "block" },
    // Binds to the heading inside it. Without one, the element is the heading.
    header: {
      tag: "ui-accordion-header",
      display: "block",
      target: (el) => el.querySelector<HTMLElement>(heading) ?? el,
      render(el) {
        if (el.querySelector(heading)) {
          return
        }
        el.setAttribute("role", "heading")
        if (!el.hasAttribute("aria-level")) {
          el.setAttribute("aria-level", "3")
        }
      },
    },
    // A wrapper, so the trigger stays a real button with its built-in behavior.
    trigger: {
      tag: "ui-accordion-trigger",
      display: "contents",
      target: wrappedButton,
    },
    panel: { tag: "ui-accordion-panel", display: "block" },
  })
}

export { defineAccordionElements }
