"use client"

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/react/accordion"
import { ChevronDownIcon } from "lucide-react"

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
      {sections.map((section) => (
        <AccordionItem key={section.value} value={section.value}>
          <AccordionHeader>
            <AccordionTrigger>
              {section.label}
              <ChevronDownIcon aria-hidden="true" />
            </AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel>
            {section.topics ? (
              <Accordion multiple>
                {section.topics.map((topic) => (
                  <AccordionItem key={topic.value} value={topic.value}>
                    <AccordionHeader render={<h4 />}>
                      <AccordionTrigger>
                        {topic.label}
                        <ChevronDownIcon aria-hidden="true" />
                      </AccordionTrigger>
                    </AccordionHeader>
                    <AccordionPanel>{topic.content}</AccordionPanel>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <div>{section.content}</div>
            )}
          </AccordionPanel>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

export { Example }
