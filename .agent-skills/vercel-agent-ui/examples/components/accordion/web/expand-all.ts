import type { AccordionController } from "@ui-sdk/core/accordion"
import "@ui-sdk/web/accordion"
import { ChevronDown, createElement } from "lucide"

const weeks = [
  {
    value: "week-1",
    label: "Week 1: Foundations",
    content:
      "Set up your editor, meet the command line and write your first script.",
  },
  {
    value: "week-2",
    label: "Week 2: Data and types",
    content:
      "Strings, numbers, lists and objects, and how to tell them apart when a program runs.",
  },
  {
    value: "week-3",
    label: "Week 3: Control flow",
    content:
      "Conditions, loops and functions. The project this week is a small text adventure.",
  },
  {
    value: "week-4",
    label: "Week 4: Working with files",
    content:
      "Read and write files, parse CSV and JSON, and handle the errors that come with them.",
  },
  {
    value: "week-5",
    label: "Week 5: Final project",
    content:
      "Build a tool you'll use yourself, then present it to the group in a five-minute demo.",
  },
]

type OpenChange = CustomEvent<{ value: boolean; reason: string }>

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div>
      <div data-slot="controls">
        <button type="button" data-action="expand">Expand all</button>
        <button type="button" data-action="collapse">Collapse all</button>
      </div>
      <div data-slot="scroll">
        <ui-accordion multiple>
          ${weeks
            .map(
              (week) => `
                <ui-accordion-item value="${week.value}">
                  <ui-accordion-header>
                    <h3>
                      <ui-accordion-trigger>
                        <button type="button" aria-expanded="false">
                          ${week.label}
                          ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
                        </button>
                      </ui-accordion-trigger>
                    </h3>
                  </ui-accordion-header>
                  <ui-accordion-panel hidden>
                    ${week.content}
                  </ui-accordion-panel>
                </ui-accordion-item>`
            )
            .join("")}
        </ui-accordion>
      </div>
    </div>
  `
  const syllabus = root.querySelector("ui-accordion") as HTMLElement & {
    api: AccordionController
  }
  root
    .querySelector("[data-action=expand]")!
    .addEventListener("click", () => syllabus.api.openAll())
  root
    .querySelector("[data-action=collapse]")!
    .addEventListener("click", () => syllabus.api.closeAll())

  let pressed: EventTarget | null = null
  syllabus.addEventListener(
    "openchange",
    (event) => {
      const { value: open, reason } = (event as OpenChange).detail
      if (open && reason === "trigger-press") {
        pressed = event.target
      } else if (pressed === event.target) {
        pressed = null
      }
    },
    { capture: true }
  )
  syllabus.addEventListener(
    "openchangecomplete",
    (event) => {
      const { value: open } = (event as OpenChange).detail
      const week = event.target as HTMLElement
      if (!open || pressed !== week) {
        return
      }
      pressed = null
      week.scrollIntoView({ block: "nearest", behavior: "smooth" })
    },
    { capture: true }
  )
}

export { mount }
