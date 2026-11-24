import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/solid/accordion"
import { For } from "solid-js"

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
      <For each={items}>
        {(item) => (
          <AccordionItem value={item.value}>
            <AccordionHeader>
              <AccordionTrigger>
                {item.label}
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
            <AccordionPanel>{item.content}</AccordionPanel>
          </AccordionItem>
        )}
      </For>
    </Accordion>
  )
}

export { Example }
