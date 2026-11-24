"use client"

import { createAccordionController } from "@ui-sdk/core/accordion"
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/react/accordion"
import { ChevronDownIcon } from "lucide-react"
import * as React from "react"

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
  const [syllabus] = React.useState(() => createAccordionController())
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
          {weeks.map((week) => (
            <Week key={week.value} week={week} />
          ))}
        </Accordion>
      </div>
    </div>
  )
}

function Week({ week }: { week: (typeof weeks)[number] }) {
  const item = React.useRef<HTMLDivElement>(null)
  const pressed = React.useRef(false)

  return (
    <AccordionItem
      ref={item}
      value={week.value}
      onOpenChange={(open, details) => {
        pressed.current = open && details.reason === "trigger-press"
      }}
      onOpenChangeComplete={(open) => {
        if (open && pressed.current) {
          item.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
        }
      }}
    >
      <AccordionHeader>
        <AccordionTrigger>
          {week.label}
          <ChevronDownIcon aria-hidden="true" />
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionPanel>{week.content}</AccordionPanel>
    </AccordionItem>
  )
}

export { Example }
