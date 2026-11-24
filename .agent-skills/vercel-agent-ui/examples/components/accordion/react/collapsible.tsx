"use client"

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/react/accordion"
import { ChevronDownIcon } from "lucide-react"

const items = [
  {
    value: "overview",
    label: "Overview",
    content: "A summary of the project, its goals and its owners.",
  },
  {
    value: "timeline",
    label: "Timeline",
    content: "Kickoff in March, beta in June and launch in September.",
  },
  {
    value: "budget",
    label: "Budget",
    content: "Approved for two engineers and one designer for six months.",
  },
]

function Example() {
  return (
    <Accordion collapsible={false} defaultValue={["overview"]}>
      {items.map((item) => (
        <AccordionItem key={item.value} value={item.value}>
          <AccordionHeader>
            <AccordionTrigger>
              {item.label}
              <ChevronDownIcon aria-hidden="true" />
            </AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel>{item.content}</AccordionPanel>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

export { Example }
