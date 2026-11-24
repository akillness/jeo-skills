import { createAccordionController } from "@ui-sdk/core/accordion"
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/solid/accordion"
import { For } from "solid-js"

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

function Example() {
  const syllabus = createAccordionController()
  return (
    <div>
      <div data-slot="controls">
        <button type="button" onClick={() => syllabus.openAll()}>
          Expand all
        </button>
        <button type="button" onClick={() => syllabus.closeAll()}>
          Collapse all
        </button>
      </div>
      <div data-slot="scroll">
        <Accordion multiple controller={syllabus}>
          <For each={weeks}>{(week) => <Week week={week} />}</For>
        </Accordion>
      </div>
    </div>
  )
}

function Week(props: { week: (typeof weeks)[number] }) {
  let item: HTMLDivElement | undefined
  let pressed = false

  return (
    <AccordionItem
      ref={item}
      value={props.week.value}
      onOpenChange={(open, details) => {
        pressed = open && details.reason === "trigger-press"
      }}
      onOpenChangeComplete={(open) => {
        if (open && pressed) {
          item?.scrollIntoView({ block: "nearest", behavior: "smooth" })
        }
      }}
    >
      <AccordionHeader>
        <AccordionTrigger>
          {props.week.label}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionPanel>{props.week.content}</AccordionPanel>
    </AccordionItem>
  )
}

export { Example }
