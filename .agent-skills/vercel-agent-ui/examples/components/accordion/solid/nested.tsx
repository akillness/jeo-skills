import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/solid/accordion"
import { For } from "solid-js"

const sections: {
  value: string
  label: string
  content?: string
  topics?: { value: string; label: string; content: string }[]
}[] = [
  {
    value: "profile",
    label: "Profile",
    content: "Your name, photo and the email address people see.",
  },
  {
    value: "notifications",
    label: "Notifications",
    topics: [
      {
        value: "email",
        label: "Email",
        content: "A weekly digest, and mentions as they happen.",
      },
      {
        value: "push",
        label: "Push",
        content: "Direct messages and replies to your comments.",
      },
    ],
  },
  {
    value: "billing",
    label: "Billing",
    topics: [
      {
        value: "payment",
        label: "Payment methods",
        content: "A Visa card ending in 4242, used for every renewal.",
      },
      {
        value: "invoices",
        label: "Invoices",
        content: "Download a PDF of any invoice from the last two years.",
      },
    ],
  },
]

function Example() {
  return (
    <Accordion defaultValue={["notifications"]}>
      <For each={sections}>
        {(section) => (
          <AccordionItem value={section.value}>
            <AccordionHeader>
              <AccordionTrigger>
                {section.label}
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
            <AccordionPanel>
              {section.topics ? (
                <Accordion multiple>
                  <For each={section.topics}>
                    {(topic) => (
                      <AccordionItem value={topic.value}>
                        <AccordionHeader render={(props) => <h4 {...props} />}>
                          <AccordionTrigger>
                            {topic.label}
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
                        <AccordionPanel>{topic.content}</AccordionPanel>
                      </AccordionItem>
                    )}
                  </For>
                </Accordion>
              ) : (
                <div>{section.content}</div>
              )}
            </AccordionPanel>
          </AccordionItem>
        )}
      </For>
    </Accordion>
  )
}

export { Example }
